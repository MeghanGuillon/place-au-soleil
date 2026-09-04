"""Construit un index national SNCF léger pour Place au Soleil.

Sorties :
- data/stations.json : gares canoniques + coordonnées
- data/manifest.json : dates disponibles
- data/dates/YYYY-MM-DD.json : trains de la journée, avec arrêts et horaires
"""
import io
import json
import os
import re
import shutil
import zipfile
from collections import Counter
from datetime import datetime, timezone

import pandas as pd
import requests

GTFS_URL = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
DATES_DIR = os.path.join(ROOT, "dates")
DATE_RE = re.compile(r"(20\d{6})(?!.*20\d{6})")


def download_gtfs():
    print("Téléchargement du GTFS national SNCF…")
    r = requests.get(GTFS_URL, timeout=180)
    r.raise_for_status()
    print(f"  {len(r.content)/1e6:.1f} Mo")
    return zipfile.ZipFile(io.BytesIO(r.content))


def extract_date(*values):
    for value in values:
        if value is None or pd.isna(value):
            continue
        m = DATE_RE.search(str(value))
        if m:
            raw = m.group(1)
            try:
                return datetime.strptime(raw, "%Y%m%d").strftime("%Y-%m-%d")
            except ValueError:
                pass
    return None


def canonical_stations(stops):
    stops = stops.copy()
    if "parent_station" not in stops.columns:
        stops["parent_station"] = ""
    stops["canonical_id"] = stops["parent_station"].fillna("").where(
        stops["parent_station"].fillna("") != "", stops["stop_id"]
    ).astype(str)

    by_id = stops.set_index("stop_id", drop=False)
    station_rows = []
    stop_to_station = {}

    for cid, group in stops.groupby("canonical_id", sort=False):
        stop_to_station.update({str(x): str(cid) for x in group["stop_id"]})
        parent = by_id.loc[cid] if cid in by_id.index else None
        if isinstance(parent, pd.DataFrame):
            parent = parent.iloc[0]

        if parent is not None:
            name = str(parent.get("stop_name") or "").strip()
            lat = parent.get("stop_lat")
            lon = parent.get("stop_lon")
        else:
            names = [str(x).strip() for x in group["stop_name"].dropna() if str(x).strip()]
            name = Counter(names).most_common(1)[0][0] if names else str(cid)
            lat = pd.to_numeric(group.get("stop_lat"), errors="coerce").mean()
            lon = pd.to_numeric(group.get("stop_lon"), errors="coerce").mean()

        if pd.isna(lat) or pd.isna(lon):
            continue
        station_rows.append({"id": str(cid), "name": name, "lat": float(lat), "lon": float(lon)})

    station_rows.sort(key=lambda x: x["name"].lower())
    return station_rows, stop_to_station


def train_kind(trip_id):
    text = str(trip_id).upper()
    for key in ("TGV", "TER", "IC", "INTERCITES"):
        if f":{key}:" in text or f"_{key}:" in text:
            return "Intercités" if key in ("IC", "INTERCITES") else key
    return "Train"


def main():
    zf = download_gtfs()
    with zf.open("stops.txt") as f:
        stops = pd.read_csv(f, dtype=str)
    with zf.open("trips.txt") as f:
        trips = pd.read_csv(f, dtype=str)

    stations, stop_to_station = canonical_stations(stops)
    station_ids = {s["id"] for s in stations}
    print(f"Gares canoniques : {len(stations)}")

    meta = {}
    has_short = "trip_short_name" in trips.columns
    for row in trips.itertuples(index=False):
        d = row._asdict()
        trip_id = str(d.get("trip_id", ""))
        date = extract_date(trip_id, d.get("service_id"))
        if not date:
            continue
        meta[trip_id] = {
            "date": date,
            "number": str(d.get("trip_short_name", "") or "") if has_short else "",
            "kind": train_kind(trip_id),
        }
    print(f"Trips datés : {len(meta)}")

    wanted = set(meta)
    cols = ["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"]
    pieces = []
    print("Lecture de stop_times.txt…")
    with zf.open("stop_times.txt") as f:
        for chunk in pd.read_csv(f, dtype=str, usecols=cols, chunksize=500_000):
            hit = chunk[chunk["trip_id"].isin(wanted)]
            if not hit.empty:
                pieces.append(hit)
    if not pieces:
        raise RuntimeError("Aucun stop_time exploitable n'a été trouvé.")

    times = pd.concat(pieces, ignore_index=True)
    times["stop_sequence"] = pd.to_numeric(times["stop_sequence"], errors="coerce")
    times = times.dropna(subset=["stop_sequence"]).sort_values(["trip_id", "stop_sequence"])

    by_date = {}
    kept = 0
    for trip_id, group in times.groupby("trip_id", sort=False):
        info = meta.get(str(trip_id))
        if not info:
            continue
        stops_out = []
        previous = None
        for row in group.itertuples(index=False):
            cid = stop_to_station.get(str(row.stop_id))
            if not cid or cid not in station_ids:
                continue
            if cid == previous:
                if stops_out:
                    stops_out[-1][1] = str(row.arrival_time or stops_out[-1][1])
                    stops_out[-1][2] = str(row.departure_time or stops_out[-1][2])
                continue
            stops_out.append([cid, str(row.arrival_time or ""), str(row.departure_time or "")])
            previous = cid
        if len(stops_out) < 2:
            continue

        obj = {
            "id": str(trip_id),
            "n": info["number"],
            "k": info["kind"],
            "s": stops_out,
        }
        by_date.setdefault(info["date"], []).append(obj)
        kept += 1

    print(f"Trips conservés : {kept}")
    os.makedirs(ROOT, exist_ok=True)
    if os.path.isdir(DATES_DIR):
        shutil.rmtree(DATES_DIR)
    os.makedirs(DATES_DIR, exist_ok=True)

    with open(os.path.join(ROOT, "stations.json"), "w", encoding="utf-8") as f:
        json.dump({"stations": stations}, f, ensure_ascii=False, separators=(",", ":"))

    manifest_dates = []
    for date, trains in sorted(by_date.items()):
        path = os.path.join(DATES_DIR, f"{date}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"date": date, "trains": trains}, f, ensure_ascii=False, separators=(",", ":"))
        manifest_dates.append({"date": date, "count": len(trains)})

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SNCF Open Data — Licence Ouverte Etalab 2.0",
        "dates": manifest_dates,
    }
    with open(os.path.join(ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Dates générées : {len(manifest_dates)}")
    if manifest_dates:
        print(f"Période : {manifest_dates[0]['date']} → {manifest_dates[-1]['date']}")


if __name__ == "__main__":
    main()
