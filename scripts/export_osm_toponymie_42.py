#!/usr/bin/env python3
"""Exporte toponymes, lieux-dits et zones d'habitation du département 42 depuis OSM."""

import json
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "geojson" / "D42"

EXPORTS = {
    "toponymes": {
        "file": "toponymes_osm_42.json",
        "name": "toponymes_loire_42",
        "query": """
[out:json][timeout:240];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  nwr["name"]["natural"](area.searchArea);
  nwr["name"]["waterway"](area.searchArea);
  nwr["name"]["landform"](area.searchArea);
  nwr["name"]["historic"](area.searchArea);
);
out center tags;
""",
        "mode": "toponyme",
    },
    "lieux_dits": {
        "file": "lieux_dits_osm_42.json",
        "name": "lieux_dits_loire_42",
        "query": """
[out:json][timeout:240];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  nwr["place"="locality"](area.searchArea);
  nwr["place"="hamlet"](area.searchArea);
  nwr["place"="isolated_dwelling"](area.searchArea);
);
out center tags;
""",
        "mode": "lieu_dit",
    },
    "zones_habitation": {
        "file": "zones_habitation_osm_42.json",
        "name": "zones_habitation_loire_42",
        "query": """
[out:json][timeout:300];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  nwr["landuse"="residential"](area.searchArea);
);
out geom tags;
""",
        "mode": "zone",
    },
}


def fetch_overpass(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
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


def way_coords_from_geom(geometry: list) -> list:
    return [[pt["lon"], pt["lat"]] for pt in geometry]


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


def closed_polygon(coords: list):
    if len(coords) < 3:
        return None
    if coords[0] != coords[-1]:
        coords = coords + [coords[0]]
    if len(coords) < 4:
        return None
    return {"type": "Polygon", "coordinates": [coords]}


def relation_to_polygon(relation: dict):
    outers, inners = [], []
    for member in relation.get("members", []):
        if member.get("type") != "way":
            continue
        coords = way_coords_from_geom(member.get("geometry", []))
        if len(coords) < 2:
            continue
        if member.get("role") == "inner":
            inners.append(coords)
        else:
            outers.append(coords)

    outer_rings = stitch_rings(outers)
    inner_rings = stitch_rings(inners)
    if not outer_rings:
        return None
    if len(outer_rings) == 1:
        return {"type": "Polygon", "coordinates": [outer_rings[0]] + inner_rings}
    return {
        "type": "MultiPolygon",
        "coordinates": [[ring] for ring in outer_rings],
    }


def element_geometry(el: dict, mode: str):
    if mode == "zone":
        if el["type"] == "relation":
            return relation_to_polygon(el)
        if el.get("geometry"):
            return closed_polygon(way_coords_from_geom(el["geometry"]))
        return None

    if el["type"] == "node":
        return {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
    if "center" in el:
        return {
            "type": "Point",
            "coordinates": [el["center"]["lon"], el["center"]["lat"]],
        }
    return None


def feature_type_label(tags: dict, mode: str) -> str:
    if mode == "lieu_dit":
        return tags.get("place", "")
    if mode == "toponyme":
        for key in ("natural", "waterway", "landform", "historic"):
            if key in tags:
                return key
    if mode == "zone":
        return tags.get("landuse", "residential")
    return ""


def osm_to_geojson(elements: list, collection: str, mode: str) -> dict:
    seen = set()
    features = []
    for el in elements:
        key = (el["type"], el["id"])
        if key in seen:
            continue
        seen.add(key)

        tags = el.get("tags", {})
        if mode == "toponyme" and "place" in tags:
            continue

        geom = element_geometry(el, mode)
        if not geom:
            continue

        props = {
            "osm_id": el["id"],
            "osm_type": el["type"],
            "nom": tags.get("name", ""),
            "type": feature_type_label(tags, mode),
            "commune": tags.get("addr:city", tags.get("is_in:city", "")),
            "code_postal": tags.get("addr:postcode", ""),
        }
        props = {k: v for k, v in props.items() if v}
        features.append({"type": "Feature", "properties": props, "geometry": geom})

    features.sort(key=lambda f: (f["properties"].get("nom") or "").upper())
    return {
        "type": "FeatureCollection",
        "name": collection,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for key, cfg in EXPORTS.items():
        osm = fetch_overpass(cfg["query"])
        geojson = osm_to_geojson(osm.get("elements", []), cfg["name"], cfg["mode"])
        output = OUTPUT_DIR / cfg["file"]
        with open(output, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False, indent=2)
        print(f"Exporté : {len(geojson['features'])} {key} -> {output}")


if __name__ == "__main__":
    main()
