"""Construit des géométries ferroviaires RFN réutilisables entre gares SNCF adjacentes.

Le but est de ne jamais interroger SNCF Réseau depuis le navigateur : ce script est lancé
périodiquement par GitHub Actions, calcule les chemins une fois, puis publie des shards JSON.

Sorties :
- data/segments/index.json
- data/segments/0.json ... f.json

Chaque clé représente une paire de gares canoniques. La géométrie est toujours stockée
dans le sens lexicographique de la clé ; le frontend l'inverse si nécessaire.
"""
import glob
import hashlib
import heapq
import json
import math
import os
import shutil
from collections import defaultdict
from datetime import datetime, timezone

import requests

ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
SEGMENTS_DIR = os.path.join(ROOT, "segments")
RFN_URL = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/formes-des-lignes-du-rfn/records"
ROUND_DIGITS = 5
SHARDS = "0123456789abcdef"


def haversine(a, b):
    lon1, lat1 = a
    lon2, lat2 = b
    r = math.pi / 180
    dlat = (lat2 - lat1) * r
    dlon = (lon2 - lon1) * r
    q = math.sin(dlat / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(q))


def qpoint(p):
    return (round(float(p[0]), ROUND_DIGITS), round(float(p[1]), ROUND_DIGITS))


def pair_key(a, b):
    return "|".join(sorted((str(a), str(b))))


def shard_for(key):
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[0]


def fetch_rfn():
    records = []
    offset = 0
    total = None
    while total is None or offset < total:
        r = requests.get(RFN_URL, params={"limit": 100, "offset": offset}, timeout=90)
        r.raise_for_status()
        payload = r.json()
        total = int(payload.get("total_count", 0))
        batch = payload.get("results", [])
        records.extend(batch)
        offset += len(batch)
        print(f"RFN : {min(offset, total)}/{total} tronçons")
        if not batch:
            break
    return records


def iter_lines(shape):
    if not shape:
        return
    geom = shape.get("geometry") if shape.get("type") == "Feature" else shape
    if not geom:
        return
    kind = geom.get("type")
    coords = geom.get("coordinates") or []
    if kind == "LineString":
        yield coords
    elif kind == "MultiLineString":
        yield from coords


def build_graph(records):
    graph = defaultdict(dict)
    active = 0
    points = 0
    for rec in records:
        if str(rec.get("mnemo", "")).upper() == "NEUT" or "neutral" in str(rec.get("libelle", "")).lower():
            continue
        used = False
        for line in iter_lines(rec.get("geo_shape")):
            pts = [qpoint(p) for p in line if len(p) >= 2]
            if len(pts) < 2:
                continue
            used = True
            points += len(pts)
            for a, b in zip(pts, pts[1:]):
                if a == b:
                    continue
                w = haversine(a, b)
                old = graph[a].get(b)
                if old is None or w < old:
                    graph[a][b] = w
                    graph[b][a] = w
        if used:
            active += 1
    print(f"Graphe RFN : {len(graph)} nœuds, {points} points, {active} tronçons actifs")
    return graph


def build_grid(nodes, cell=0.05):
    grid = defaultdict(list)
    for node in nodes:
        grid[(math.floor(node[0] / cell), math.floor(node[1] / cell))].append(node)
    return grid, cell


def snap(point, grid, cell):
    bx, by = math.floor(point[0] / cell), math.floor(point[1] / cell)
    best = None
    best_d = float("inf")
    for radius in range(0, 5):
        found = False
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                if radius and abs(dx) != radius and abs(dy) != radius:
                    continue
                for node in grid.get((bx + dx, by + dy), []):
                    found = True
                    d = haversine(point, node)
                    if d < best_d:
                        best, best_d = node, d
        if found and best is not None:
            return best, best_d
    return best, best_d


def astar(graph, start, goal):
    if start == goal:
        return [start], 0.0
    queue = [(haversine(start, goal), 0.0, start)]
    dist = {start: 0.0}
    prev = {}
    while queue:
        _, g, node = heapq.heappop(queue)
        if g != dist.get(node):
            continue
        if node == goal:
            path = [goal]
            while path[-1] != start:
                path.append(prev[path[-1]])
            path.reverse()
            return path, g
        for nxt, w in graph[node].items():
            ng = g + w
            if ng < dist.get(nxt, float("inf")):
                dist[nxt] = ng
                prev[nxt] = node
                heapq.heappush(queue, (ng + haversine(nxt, goal), ng, nxt))
    return None, None


def simplify(path):
    if len(path) <= 2:
        return path
    out = [path[0]]
    carried = 0.0
    previous = path[0]
    for point in path[1:-1]:
        carried += haversine(previous, point)
        previous = point
        if carried >= 0.65:
            out.append(point)
            carried = 0.0
    out.append(path[-1])
    return out


def load_stations():
    with open(os.path.join(ROOT, "stations.json"), encoding="utf-8") as f:
        data = json.load(f)
    return {str(s["id"]): (float(s["lon"]), float(s["lat"])) for s in data.get("stations", [])}


def load_pairs():
    pairs = set()
    for path in glob.glob(os.path.join(ROOT, "dates", "*.json")):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for train in data.get("trains", []):
            stops = [str(s[0]) for s in train.get("s", [])]
            for a, b in zip(stops, stops[1:]):
                if a != b:
                    pairs.add(pair_key(a, b))
    return sorted(pairs)


def main():
    stations = load_stations()
    pairs = load_pairs()
    print(f"Paires de gares adjacentes à traiter : {len(pairs)}")

    graph = build_graph(fetch_rfn())
    grid, cell = build_grid(graph.keys())

    involved = {sid for key in pairs for sid in key.split("|", 1)}
    snaps = {}
    for sid in involved:
        if sid not in stations:
            continue
        node, d = snap(stations[sid], grid, cell)
        if node is not None:
            snaps[sid] = (node, d)

    shards = {s: {} for s in SHARDS}
    ok = 0
    skipped = 0
    failures = 0
    for idx, key in enumerate(pairs, 1):
        a, b = key.split("|", 1)
        sa, sb = snaps.get(a), snaps.get(b)
        if not sa or not sb or sa[1] > 1.5 or sb[1] > 1.5:
            skipped += 1
            continue
        straight = haversine(stations[a], stations[b])
        path, km = astar(graph, sa[0], sb[0])
        if not path or km is None:
            failures += 1
            continue
        # Évite de publier un chemin manifestement aberrant. Le frontend retombera sur l'approximation.
        if straight > 1 and (km < straight * 0.88 or km > max(straight * 3.5, straight + 80)):
            failures += 1
            continue
        geom = simplify(path)
        shards[shard_for(key)][key] = [[p[0], p[1]] for p in geom]
        ok += 1
        if idx % 100 == 0 or idx == len(pairs):
            print(f"Routage : {idx}/{len(pairs)} · OK {ok} · ignorés {skipped} · échecs {failures}")

    if os.path.isdir(SEGMENTS_DIR):
        shutil.rmtree(SEGMENTS_DIR)
    os.makedirs(SEGMENTS_DIR, exist_ok=True)
    for shard, payload in shards.items():
        with open(os.path.join(SEGMENTS_DIR, f"{shard}.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SNCF Réseau — formes des lignes du RFN",
        "pairs_total": len(pairs),
        "pairs_routed": ok,
        "pairs_skipped": skipped,
        "pairs_failed": failures,
        "shards": list(SHARDS),
    }
    with open(os.path.join(SEGMENTS_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(json.dumps(index, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
