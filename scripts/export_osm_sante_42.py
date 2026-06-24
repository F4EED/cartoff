#!/usr/bin/env python3
"""Exporte les établissements de santé OSM (amenity=clinic|hospital|pharmacy) du département 42."""

import json
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "geojson" / "D42"

AMENITIES = {
    "clinic": "cliniques_osm_42.geojson",
    "hospital": "hopitaux_osm_42.geojson",
    "pharmacy": "pharmacies_osm_42.geojson",
}


def build_query(amenity: str) -> str:
    return f"""
[out:json][timeout:180];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  nwr["amenity"="{amenity}"](area.searchArea);
);
out center tags;
"""


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


def osm_to_geojson(elements: list, amenity: str) -> dict:
    seen = set()
    features = []
    for el in elements:
        key = (el["type"], el["id"])
        if key in seen:
            continue
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
            "amenity": amenity,
            "nom": tags.get("name", ""),
            "operateur": tags.get("operator", ""),
            "adresse": build_address(tags),
            "telephone": tags.get("phone", tags.get("contact:phone", "")),
            "urgences": tags.get("emergency", ""),
            "specialite": tags.get("healthcare", tags.get("healthcare:speciality", "")),
            "horaires": tags.get("opening_hours", ""),
            "website": tags.get("website", tags.get("contact:website", "")),
        }
        props = {k: v for k, v in props.items() if v}

        features.append({"type": "Feature", "properties": props, "geometry": geom})

    features.sort(key=lambda f: (f["properties"].get("nom") or "").upper())
    return {
        "type": "FeatureCollection",
        "name": f"{amenity}_loire_42",
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
            with urllib.request.urlopen(req, timeout=240) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Échec Overpass API : {last_error}")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for amenity, filename in AMENITIES.items():
        osm = fetch_overpass(build_query(amenity))
        geojson = osm_to_geojson(osm.get("elements", []), amenity)
        output = OUTPUT_DIR / filename
        with open(output, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False, indent=2)
        print(f"Exporté : {len(geojson['features'])} {amenity} -> {output}")


if __name__ == "__main__":
    main()
