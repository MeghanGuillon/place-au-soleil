"""
Génère data/routes.json à partir du GTFS national SNCF.
Le fichier produit contient les horaires, le tracé et des segments avec leur cap.
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
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "routes.json")

ROUTES = [
    {"id": "paris-austerlitz-vierzon", "name": "Paris Austerlitz → Vierzon", "origin": "Paris Austerlitz", "destination": "Vierzon"},
    {"id": "paris-lyon-part-dieu", "name": "Paris (Gare de Lyon) → Lyon Part-Dieu", "origin": "Paris Gare de Lyon", "destination": "Lyon Part Dieu"},
    {"id": "paris-montparnasse-bordeaux", "name": "Paris (Montparnasse) → Bordeaux St-Jean", "origin": "Paris Montparnasse", "destination": "Bordeaux St Jean"},
    {"id": "paris-lyon-marseille", "name": "Paris (Gare de Lyon) → Marseille St-Charles", "origin": "Paris Gare de Lyon", "destination": "Marseille St Charles"},
]

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def solar_position(lat: float, lon: float, dt: datetime) -> tuple[float, float]:
    if dt.tzinfo is None:
        raise ValueError("La date doit avoir un timezone.")

    dt_utc = dt.astimezone(timezone.utc)
    year, month, day = dt_utc.year, dt_utc.month, dt_utc.day
    hour = dt_utc.hour + dt_utc.minute / 60 + dt_utc.second / 3600

    if month <= 2:
        year -= 1
        month += 12

    a = math.floor(year / 100)
    b = 2 - a + math.floor(a / 4)
    jd = (
        math.floor(365.25 * (year + 4716))
        + math.floor(30.6001 * (month + 1))
        + day + b - 1524.5 + hour / 24
    )
    t = (jd - 2451545.0) / 36525.0

    geom_long = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
    geom_anom = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    m = math.radians(geom_anom)
    center = (
        math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + math.sin(2 * m) * (0.019993 - 0.000101 * t)
        + math.sin(3 * m) * 0.000289
    )
    true_long = geom_long + center
    omega = 125.04 - 1934.136 * t
    app_long = true_long - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    mean_obliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    obliq = mean_obliq + 0.00256 * math.cos(math.radians(omega))
    decl = math.degrees(math.asin(math.sin(math.radians(obliq)) * math.sin(math.radians(app_long))))
    y = math.tan(math.radians(obliq / 2)) ** 2
    eq_time = 4 * math.degrees(
        y * math.sin(2 * math.radians(geom_long))
        - 2 * ecc * math.sin(m)
        + 4 * ecc * y * math.sin(m) * math.cos(2 * math.radians(geom_long))
        - 0.5 * y**2 * math.sin(4 * math.radians(geom_long))
        - 1.25 * ecc**2 * math.sin(2 * m)
    )

    minutes = dt_utc.hour * 60 + dt_utc.minute + dt_utc.second / 60
    solar_time = (minutes + eq_time + 4 * lon) % 1440
    hour_angle = solar_time / 4 - 180

    lat_r = math.radians(lat)
    dec_r = math.radians(decl)
    ha_r = math.radians(hour_angle)
    cos_zenith = (
        math.sin(lat_r) * math.sin(dec_r)
        + math.cos(lat_r) * math.cos(dec_r) * math.cos(ha_r)
    )
    cos_zenith = max(-1.0, min(1.0, cos_zenith))
    elevation = 90 - math.degrees(math.acos(cos_zenith))
    azimuth = math.degrees(
        math.atan2(
            math.sin(ha_r),
            math.cos(ha_r) * math.sin(lat_r) - math.tan(dec_r) * math.cos(lat_r),
        )
    )
    return (azimuth + 180) % 360, elevation


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def sun_side(train_bearing: float, sun_azimuth: float) -> str:
    rel = (sun_azimuth - train_bearing + 360) % 360
    if rel <= 45 or rel >= 315:
        return "front"
    if rel < 135:
        return "right"
    if rel <= 225:
        return "back"
    return "left"


def build_segments(shape_points: list[dict]) -> list[dict]:
    segments = []
    for start, end in zip(shape_points, shape_points[1:]):
        lat1, lon1 = float(start["shape_pt_lat"]), float(start["shape_pt_lon"])
        lat2, lon2 = float(end["shape_pt_lat"]), float(end["shape_pt_lon"])
        segments.append({
            "start": {"lat": lat1, "lon": lon1},
            "end": {"lat": lat2, "lon": lon2},
            "midpoint": {"lat": (lat1 + lat2) / 2, "lon": (lon1 + lon2) / 2},
            "bearing": bearing(lat1, lon1, lat2, lon2),
        })
    return segments


def find_stop_ids(stops: pd.DataFrame, station_name: str) -> set[str]:
    target = normalize(station_name)
    names = stops["stop_name"].apply(normalize)
    mask = names.apply(lambda name: target in name or name in target)
    matched = set(stops.loc[mask, "stop_id"].astype(str))
    print(f"  {station_name}: {len(matched)} stop_id(s)")
    return matched


def to_minutes(value: str) -> float:
    h, m, s = map(int, value.split(":"))
    return h * 60 + m + s / 60


def download_gtfs() -> zipfile.ZipFile:
    print("Téléchargement du GTFS SNCF…")
    response = requests.get(GTFS_URL, timeout=120)
    response.raise_for_status()
    print(f"  {len(response.content) / 1e6:.1f} Mo")
    return zipfile.ZipFile(io.BytesIO(response.content))


def read_shape(zf: zipfile.ZipFile, shape_id: str) -> list[dict]:
    matches = []
    with zf.open("shapes.txt") as f:
        for chunk in pd.read_csv(f, dtype=str, chunksize=500_000):
            hit = chunk[chunk["shape_id"].astype(str) == str(shape_id)]
            if not hit.empty:
                matches.append(hit)
    if not matches:
        return []
    shape = pd.concat(matches, ignore_index=True)
    shape["shape_pt_sequence"] = shape["shape_pt_sequence"].astype(int)
    shape = shape.sort_values("shape_pt_sequence")
    return shape[["shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"]].to_dict("records")


def main():
    zf = download_gtfs()

    with zf.open("stops.txt") as f:
        stops = pd.read_csv(f, dtype=str)
    with zf.open("trips.txt") as f:
        trips = pd.read_csv(f, dtype=str)

    if "calendar.txt" in zf.namelist():
        with zf.open("calendar.txt") as f:
            calendar = pd.read_csv(f, dtype=str)
    else:
        print("  calendar.txt absent : les jours seront laissés non filtrés")
        calendar = pd.DataFrame()

    stop_ids = {}
    all_ids = set()
    for route in ROUTES:
        origin_ids = find_stop_ids(stops, route["origin"])
        destination_ids = find_stop_ids(stops, route["destination"])
        stop_ids[route["id"]] = (origin_ids, destination_ids)
        all_ids |= origin_ids | destination_ids

    print("Lecture de stop_times.txt…")
    keep = ["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"]
    pieces = []
    with zf.open("stop_times.txt") as f:
        for chunk in pd.read_csv(f, dtype=str, usecols=keep, chunksize=500_000):
            hit = chunk[chunk["stop_id"].isin(all_ids)]
            if not hit.empty:
                pieces.append(hit)

    if not pieces:
        raise RuntimeError("Aucun horaire correspondant aux gares suivies n'a été trouvé.")

    hits = pd.concat(pieces, ignore_index=True)
    hits["stop_sequence"] = hits["stop_sequence"].astype(int)

    output_routes = []
    grouped = hits.groupby("trip_id")

    for route in ROUTES:
        origin_ids, destination_ids = stop_ids[route["id"]]
        matching = []

        for trip_id, group in grouped:
            origins = group[group["stop_id"].isin(origin_ids)]
            destinations = group[group["stop_id"].isin(destination_ids)]
            if origins.empty or destinations.empty:
                continue
            origin = origins.sort_values("stop_sequence").iloc[0]
            destination = destinations.sort_values("stop_sequence").iloc[-1]
            if int(destination["stop_sequence"]) <= int(origin["stop_sequence"]):
                continue
            matching.append((trip_id, origin["departure_time"], destination["arrival_time"]))

        print(f"  {route['name']}: {len(matching)} circulation(s)")
        if not matching:
            continue

        trip_ids = [item[0] for item in matching]
        meta = trips[trips["trip_id"].isin(trip_ids)].set_index("trip_id")
        trips_out = []
        shape_id = None

        for trip_id, dep, arr in matching:
            if trip_id not in meta.index:
                continue
            row = meta.loc[trip_id]
            days = []
            if not calendar.empty and "service_id" in calendar.columns:
                service = calendar[calendar["service_id"] == row.get("service_id")]
                if not service.empty:
                    service_row = service.iloc[0]
                    days = [day for day in DAYS if service_row.get(day) == "1"]

            trips_out.append({
                "trip_id": trip_id,
                "departure_time": dep,
                "arrival_time": arr,
                "duration_min": round(to_minutes(arr) - to_minutes(dep)),
                "days": days,
            })

            if shape_id is None and pd.notna(row.get("shape_id")):
                shape_id = str(row.get("shape_id"))

        points = read_shape(zf, shape_id) if shape_id else []
        shape_coords = [[float(p["shape_pt_lat"]), float(p["shape_pt_lon"])] for p in points]

        output_routes.append({
            "id": route["id"],
            "name": route["name"],
            "shape": shape_coords,
            "segments": build_segments(points),
            "trips": sorted(trips_out, key=lambda trip: trip["departure_time"]),
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
