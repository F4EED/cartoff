#!/usr/bin/env python3
"""Exporte les contours des communes (boundary administrative level 8) du département 42 depuis OSM."""

import json
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
OUTPUT = Path(__file__).resolve().parent.parent / "geojson" / "D42" / "communes_contours_osm_42.geojson"

QUERY = """
[out:json][timeout:300];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  relation["boundary"="administrative"]["admin_level"="8"](area.searchArea);
);
out geom;
"""


def fetch_overpass() -> dict:
    data = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
    headers = {"User-Agent": "carteoff-export/1.0 (crisis mapping)"}
    last_error = None
    for url in OVERPASS_ENDPOINTS:
        req = urllib.request.Request(url, data=data, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Échec Overpass API : {last_error}")


def way_coords(member: dict) -> list:
    return [[pt["lon"], pt["lat"]] for pt in member.get("geometry", [])]


def stitch_rings(segments: list) -> list:
    remaining = [list(seg) for seg in segments if len(seg) >= 2]
    rings = []
    while remaining:
        ring = remaining.pop(0)
        changed = True
        while changed:
            changed = False
            for i, other in enumerate(remaining):
                if ring[-1] == other[0]:
                    ring.extend(other[1:])
                    remaining.pop(i)
                    changed = True
                    break
                if ring[-1] == other[-1]:
                    ring.extend(reversed(other[:-1]))
                    remaining.pop(i)
                    changed = True
                    break
                if ring[0] == other[-1]:
                    ring = other + ring[1:]
                    remaining.pop(i)
                    changed = True
                    break
                if ring[0] == other[0]:
                    ring = list(reversed(other))[:-1] + ring
                    remaining.pop(i)
                    changed = True
                    break
        if len(ring) >= 4:
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            rings.append(ring)
    return rings


def relation_geometry(members: list):
    outers, inners = [], []
    for member in members:
        if member.get("type") != "way":
            continue
        coords = way_coords(member)
        if len(coords) < 2:
            continue
        role = member.get("role", "outer")
        if role == "inner":
            inners.append(coords)
        else:
            outers.append(coords)

    outer_rings = stitch_rings(outers)
    inner_rings = stitch_rings(inners)
    if not outer_rings:
        return None

    if len(outer_rings) == 1:
        polygon = [outer_rings[0]] + inner_rings
        return {"type": "Polygon", "coordinates": polygon}

    multipolygon = []
    for outer in outer_rings:
        multipolygon.append([outer])
    return {"type": "MultiPolygon", "coordinates": multipolygon}


def relation_to_feature(relation: dict) -> dict | None:
    geom = relation_geometry(relation.get("members", []))
    if not geom:
        return None

    tags = relation.get("tags", {})
    props = {
        "osm_id": relation["id"],
        "nom": tags.get("name", ""),
        "code_insee": tags.get("ref:INSEE", tags.get("ref", "")),
        "code_postal": tags.get("addr:postcode", ""),
        "population": tags.get("population", ""),
    }
    props = {k: v for k, v in props.items() if v}
    return {"type": "Feature", "properties": props, "geometry": geom}


def osm_to_geojson(elements: list) -> dict:
    features = []
    for el in elements:
        if el.get("type") != "relation":
            continue
        feature = relation_to_feature(el)
        if feature:
            features.append(feature)

    features.sort(key=lambda f: (f["properties"].get("nom") or "").upper())
    return {
        "type": "FeatureCollection",
        "name": "communes_contours_loire_42",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def main():
    osm = fetch_overpass()
    geojson = osm_to_geojson(osm.get("elements", []))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    print(f"Exporté : {len(geojson['features'])} communes -> {OUTPUT}")


if __name__ == "__main__":
    main()
