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

def solar_position(lat: float, lon: float, dt: datetime) -> tuple[float, float]:
    """
    Calcule la position du soleil pour une latitude, longitude et date/heure UTC.

    Retourne :
      - azimut en degrés : 0° = nord, 90° = est, 180° = sud, 270° = ouest
      - élévation en degrés : > 0 = soleil au-dessus de l'horizon

    Calcul basé sur les équations solaires NOAA.
    """
    if dt.tzinfo is None:
        raise ValueError("La date doit avoir un timezone.")

    dt_utc = dt.astimezone(timezone.utc)

    # Jour julien
    year = dt_utc.year
    month = dt_utc.month
    day = dt_utc.day

    hour = (
        dt_utc.hour
        + dt_utc.minute / 60
        + dt_utc.second / 3600
        + dt_utc.microsecond / 3_600_000_000
    )

    if month <= 2:
        year -= 1
        month += 12

    a = math.floor(year / 100)
    b = 2 - a + math.floor(a / 4)

    jd = (
        math.floor(365.25 * (year + 4716))
        + math.floor(30.6001 * (month + 1))
        + day
        + b
        - 1524.5
        + hour / 24
    )

    t = (jd - 2451545.0) / 36525.0

    # Longitude géométrique moyenne du Soleil
    geom_mean_long_sun = (
        280.46646
        + t * (36000.76983 + t * 0.0003032)
    ) % 360

    # Anomalie moyenne
    geom_mean_anom_sun = (
        357.52911
        + t * (35999.05029 - 0.0001537 * t)
    )

    eccent_earth_orbit = (
        0.016708634
        - t * (0.000042037 + 0.0000001267 * t)
    )

    m_rad = math.radians(geom_mean_anom_sun)

    sun_eq_of_center = (
        math.sin(m_rad)
        * (1.914602 - t * (0.004817 + 0.000014 * t))
        + math.sin(2 * m_rad)
        * (0.019993 - 0.000101 * t)
        + math.sin(3 * m_rad) * 0.000289
    )

    sun_true_long = geom_mean_long_sun + sun_eq_of_center

    omega = 125.04 - 1934.136 * t

    sun_app_long = (
        sun_true_long
        - 0.00569
        - 0.00478 * math.sin(math.radians(omega))
    )

    mean_obliq_ecliptic = (
        23
        + (
            26
            + (
                21.448
                - t * (
                    46.815
                    + t * (0.00059 - t * 0.001813)
                )
            ) / 60
        ) / 60
    )

    obliq_corr = (
        mean_obliq_ecliptic
        + 0.00256 * math.cos(math.radians(omega))
    )

    declination = math.degrees(
        math.asin(
            math.sin(math.radians(obliq_corr))
            * math.sin(math.radians(sun_app_long))
        )
    )

    y = math.tan(math.radians(obliq_corr / 2)) ** 2

    equation_of_time = 4 * math.degrees(
        y * math.sin(2 * math.radians(geom_mean_long_sun))
        - 2 * eccent_earth_orbit * math.sin(m_rad)
        + 4
        * eccent_earth_orbit
        * y
        * math.sin(m_rad)
        * math.cos(2 * math.radians(geom_mean_long_sun))
        - 0.5
        * y**2
        * math.sin(4 * math.radians(geom_mean_long_sun))
        - 1.25
        * eccent_earth_orbit**2
        * math.sin(2 * m_rad)
    )

    minutes_utc = (
        dt_utc.hour * 60
        + dt_utc.minute
        + dt_utc.second / 60
    )

    true_solar_time = (
        minutes_utc
        + equation_of_time
        + 4 * lon
    ) % 1440

    hour_angle = true_solar_time / 4 - 180

    lat_rad = math.radians(lat)
    decl_rad = math.radians(declination)
    ha_rad = math.radians(hour_angle)

    cos_zenith = (
        math.sin(lat_rad) * math.sin(decl_rad)
        + math.cos(lat_rad)
        * math.cos(decl_rad)
        * math.cos(ha_rad)
    )

    cos_zenith = max(-1.0, min(1.0, cos_zenith))

    zenith = math.degrees(math.acos(cos_zenith))
    elevation = 90 - zenith

    azimuth = math.degrees(
        math.atan2(
            math.sin(ha_rad),
            math.cos(ha_rad) * math.sin(lat_rad)
            - math.tan(decl_rad) * math.cos(lat_rad),
        )
    )

    azimuth = (azimuth + 180) % 360

    return azimuth, elevation


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcule le cap entre deux points géographiques.

    Retour :
      0° = nord
      90° = est
      180° = sud
      270° = ouest
    """
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lon = math.radians(lon2 - lon1)

    x = math.sin(delta_lon) * math.cos(lat2_rad)

    y = (
        math.cos(lat1_rad) * math.sin(lat2_rad)
        - math.sin(lat1_rad)
        * math.cos(lat2_rad)
        * math.cos(delta_lon)
    )

    angle = math.degrees(math.atan2(x, y))

    return (angle + 360) % 360


def sun_side(train_bearing: float, sun_azimuth: float) -> str:
    """
    Détermine de quel côté du train se trouve le soleil.

    Retour :
      "left"
      "right"
      "front"
      "back"
    """
    relative_angle = (
        sun_azimuth - train_bearing + 360
    ) % 360

    # Soleil plutôt en face
    if relative_angle <= 45 or relative_angle >= 315:
        return "front"

    # Soleil sur la droite
    if 45 < relative_angle < 135:
        return "right"

    # Soleil plutôt derrière
    if 135 <= relative_angle <= 225:
        return "back"

    # Soleil sur la gauche
    return "left"

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
    # Test temporaire : Paris, 4 septembre 2026 à 10h UTC
    test_dt = datetime(
        2026,
        9,
        4,
        10,
        0,
        tzinfo=timezone.utc,
    )

    azimuth, elevation = solar_position(
        48.8566,
        2.3522,
        test_dt,
    )

    print("TEST SOLAIRE")
    print("Azimut :", round(azimuth, 1))
    print("Élévation :", round(elevation, 1))

    test_bearing = bearing(
        48.8566,
        2.3522,
        48.6900,
        2.3700,
    )

    print("Cap du train :", round(test_bearing, 1))
    print(
        "Côté du soleil :",
        sun_side(test_bearing, azimuth),
    )

    # main()
