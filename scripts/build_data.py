"""
Va chercher le GTFS national SNCF (TGV / Intercités / TER), en extrait
les horaires et les tracés réels pour une liste de trajets choisis,
et écrit un fichier data/routes.json exploitable par le site.
"""

import io
import json
import math
import os
import re
import unicodedata
import zipfile
from datetime import datetime, timezone

import pandas as pd
import requests

GTFS_URL = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"

# Les trajets qu'on veut suivre. On matche par NOM de gare (insensible aux
# accents/majuscules) plutôt que par identifiant technique, plus robuste.
ROUTES = [
    {"id": "paris-austerlitz-vierzon", "name": "Paris Austerlitz → Vierzon",
     "origin": "Paris Austerlitz", "destination": "Vierzon"},
    {"id": "paris-lyon-part-dieu", "name": "Paris (Gare de Lyon) → Lyon Part-Dieu",
     "origin": "Paris Gare de Lyon", "destination": "Lyon Part Dieu"},
    {"id": "paris-montparnasse-bordeaux", "name": "Paris (Montparnasse) → Bordeaux St-Jean",
     "origin": "Paris Montparnasse", "destination": "Bordeaux St Jean"},
    {"id": "paris-lyon-marseille", "name": "Paris (Gare de Lyon) → Marseille St-Charles",
     "origin": "Paris Gare de Lyon", "destination": "Marseille St Charles"},
]

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "routes.json")


def normalize(text: str) -> str:
    """minuscule, sans accents, sans ponctuation — pour comparer des noms de gares."""
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    return text


def download_gtfs() -> zipfile.ZipFile:
    print("Téléchargement du GTFS SNCF…")
    r = requests.get(GTFS_URL, timeout=120)
    r.raise_for_status()
    print(f"  {len(r.content) / 1e6:.1f} Mo téléchargés")
    return zipfile.ZipFile(io.BytesIO(r.content))


def find_stop_ids(stops_df: pd.DataFrame, station_name: str) -> set:
    target = normalize(station_name)
    mask = stops_df["stop_name"].apply(normalize).str.contains(target.split(" ")[0]) & \
           stops_df["stop_name"].apply(normalize).apply(lambda n: target in n or n in target)
    matched = stops_df.loc[mask, "stop_id"].tolist()
    print(f"  '{station_name}' → {len(matched)} stop_id(s) trouvés")
    return set(matched)


def main():
    zf = download_gtfs()

    with zf.open("stops.txt") as f:
        stops_df = pd.read_csv(f, dtype=str)

    # Ensemble des stop_id pertinents pour toutes les gares qu'on suit
    route_stop_ids = {}
    all_relevant_stop_ids = set()
    for route in ROUTES:
        o_ids = find_stop_ids(stops_df, route["origin"])
        d_ids = find_stop_ids(stops_df, route["destination"])
        route_stop_ids[route["id"]] = (o_ids, d_ids)
        all_relevant_stop_ids |= o_ids | d_ids

    # Passe en streaming sur stop_times.txt (gros fichier) pour ne garder
    # que les lignes concernant nos gares d'intérêt.
    print("Lecture de stop_times.txt (peut prendre une minute)…")
    keep_cols = ["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"]
    filtered_rows = []
    with zf.open("stop_times.txt") as f:
        for chunk in pd.read_csv(f, dtype=str, usecols=keep_cols, chunksize=500_000):
            filtered_rows.append(chunk[chunk["stop_id"].isin(all_relevant_stop_ids)])
    hits = pd.concat(filtered_rows, ignore_index=True)
    hits["stop_sequence"] = hits["stop_sequence"].astype(int)
    print(f"  {len(hits)} lignes retenues sur {len(all_relevant_stop_ids)} gares suivies")

    with zf.open("trips.txt") as f:
        trips_df = pd.read_csv(f, dtype=str)
    with zf.open("calendar.txt") as f:
        calendar_df = pd.read_csv(f, dtype=str)

    DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    output_routes = []
    for route in ROUTES:
        o_ids, d_ids = route_stop_ids[route["id"]]
        by_trip = hits.groupby("trip_id")

        matching_trips = []
        for trip_id, g in by_trip:
            o_rows = g[g["stop_id"].isin(o_ids)]
            d_rows = g[g["stop_id"].isin(d_ids)]
            if o_rows.empty or d_rows.empty:
                continue
            o_row = o_rows.sort_values("stop_sequence").iloc[0]
            d_row = d_rows.sort_values("stop_sequence").iloc[-1]
            if d_row["stop_sequence"] <= o_row["stop_sequence"]:
                continue  # mauvais sens de circulation
            matching_trips.append((trip_id, o_row["departure_time"], d_row["arrival_time"]))

        print(f"  {route['name']}: {len(matching_trips)} circulations trouvées")
        if not matching_trips:
            continue

        trip_ids = [t[0] for t in matching_trips]
        trip_meta = trips_df[trips_df["trip_id"].isin(trip_ids)].set_index("trip_id")

        trips_out, shape_points = [], None
        for trip_id, dep, arr in matching_trips:
            if trip_id not in trip_meta.index:
                continue
            meta = trip_meta.loc[trip_id]
            service = calendar_df[calendar_df["service_id"] == meta.get("service_id")]
            days = []
            if not service.empty:
                row = service.iloc[0]
                days = [d for d in DAYS if row.get(d) == "1"]

            def to_min(t):
                h, m, s = map(int, t.split(":"))
                return h * 60 + m + s / 60

            duration_min = round(to_min(arr) - to_min(dep))

            trips_out.append({
                "trip_id": trip_id,
                "departure_time": dep,
                "arrival_time": arr,
                "duration_min": duration_min,
                "days": days,
            })

            if shape_points is None and pd.notna(meta.get("shape_id")):
                shape_points = meta["shape_id"]  # on garde juste le 1er shape_id rencontré

        # Récupère le tracé géométrique réel pour ce trajet
        shape_coords = []
        if shape_points:
            with zf.open("shapes.txt") as f:
                for chunk in pd.read_csv(f, dtype=str, chunksize=500_000):
                    match = chunk[chunk["shape_id"] == shape_points]
                    if not match.empty:
                        match = match.astype({"shape_pt_sequence": int,
                                               "shape_pt_lat": float,
                                               "shape_pt_lon": float})
                        match = match.sort_values("shape_pt_sequence")
                        shape_coords = list(zip(match["shape_pt_lat"], match["shape_pt_lon"]))
                        break

        output_routes.append({
            "id": route["id"],
            "name": route["name"],
            "shape": shape_coords,
            "trips": sorted(trips_out, key=lambda t: t["departure_time"]),
        })

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "SNCF Open Data — Licence Ouverte Etalab 2.0",
            "routes": output_routes,
        }, f, ensure_ascii=False, indent=2)

    print(f"Écrit : {OUT_PATH}")


if __name__ == "__main__":
    main()
