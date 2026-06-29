#!/usr/bin/env python3
"""Exporte les mairies et gendarmeries du département 42 depuis OSM."""

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
    "mairies": {
        "output": "Maire42.json",
        "collection": "mairies_loire_42",
        "query": """
[out:json][timeout:120];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  nwr["amenity"="townhall"](area.searchArea);
);
out center tags;
""",
    },
    "gendarmerie": {
        "output": "gendarmerie 42.json",
        "collection": "gendarmerie_loire_42",
        "query": """
[out:json][timeout:120];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  nwr["amenity"="police"]["police:FR"="gendarmerie"](area.searchArea);
  nwr["amenity"="police"]["operator"="Gendarmerie nationale"](area.searchArea);
);
out center tags;
""",
    },
}


def build_address(tags: dict) -> str:
    if tags.get("addr:full"):
        return tags["addr:full"]
    return " ".join(
        filter(
            None,
            [
                tags.get("addr:housenumber"),
                tags.get("addr:street"),
                tags.get("addr:postcode"),
                tags.get("addr:city"),
            ],
        )
    )


def osm_to_geojson(elements: list, collection: str, dedupe: bool = False) -> dict:
    seen = set()
    features = []
    for el in elements:
        key = (el["type"], el["id"])
        if dedupe and key in seen:
            continue
        if dedupe:
            seen.add(key)

        tags = el.get("tags", {})
        if el["type"] == "node":
            lon, lat = el["lon"], el["lat"]
            geom = {"type": "Point", "coordinates": [lon, lat]}
        elif "center" in el:
            lon, lat = el["center"]["lon"], el["center"]["lat"]
            geom = {"type": "Point", "coordinates": [lon, lat]}
        else:
            continue

        props = {
            "osm_id": el["id"],
            "osm_type": el["type"],
            "nom": tags.get("name", tags.get("official_name", "")),
            "nom_officiel": tags.get("official_name", ""),
            "adresse": build_address(tags),
            "telephone": tags.get("phone", tags.get("contact:phone", "")),
            "email": tags.get("email", tags.get("contact:email", "")),
            "operateur": tags.get("operator", ""),
            "website": tags.get("website", tags.get("contact:website", "")),
            "horaires": tags.get("opening_hours", ""),
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


def fetch_overpass(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    headers = {"User-Agent": "carteoff-export/1.0 (crisis mapping)"}
    last_error = None
    for url in OVERPASS_ENDPOINTS:
        req = urllib.request.Request(url, data=data, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Échec Overpass API : {last_error}")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for key, cfg in EXPORTS.items():
        osm = fetch_overpass(cfg["query"])
        geojson = osm_to_geojson(
            osm.get("elements", []),
            cfg["collection"],
            dedupe=(key == "gendarmerie"),
        )
        output = OUTPUT_DIR / cfg["output"]
        with open(output, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False, indent=2)
        print(f"Exporté : {len(geojson['features'])} {key} -> {output}")


if __name__ == "__main__":
    main()
