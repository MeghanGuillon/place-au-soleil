"""Diagnostic temporaire : inspecte la géométrie officielle du Réseau Ferré National."""
import json
import urllib.request

DATASET = "fichier-de-formes-des-voies-du-reseau-ferre-national"
BASE = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "place-au-soleil/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def main():
    meta = get_json(f"{BASE}/{DATASET}")
    print("Dataset:", meta.get("dataset_id"))
    print("Fields:")
    for field in meta.get("fields", []):
        print(" -", field.get("name"), "|", field.get("type"), "|", field.get("label"))

    records = get_json(f"{BASE}/{DATASET}/records?limit=2")
    print("Total records:", records.get("total_count"))
    for i, record in enumerate(records.get("results", []), 1):
        print(f"Record {i} keys:", sorted(record.keys()))
        for key, value in record.items():
            if isinstance(value, dict) and "coordinates" in value:
                coords = value.get("coordinates")
                print(" Geometry field:", key)
                print(" Geometry type:", value.get("type"))
                print(" Coordinate sample:", str(coords)[:500])
            elif key.lower() in {"type_voie", "code_ligne", "libelle", "mnemo", "rg_troncon"}:
                print(f" {key}:", value)


if __name__ == "__main__":
    main()
