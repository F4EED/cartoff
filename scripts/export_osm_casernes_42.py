#!/usr/bin/env python3
"""Exporte les casernes de sapeurs-pompiers (amenity=fire_station) du département 42 depuis OSM."""

import json
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
OUTPUT = Path(__file__).resolve().parent.parent / "geojson" / "D42" / "casernes_osm_42.geojson"

QUERY = """
[out:json][timeout:120];
area["ISO3166-2"="FR-42"]->.searchArea;
(
  nwr["amenity"="fire_station"](area.searchArea);
);
out center tags;
"""


def osm_to_geojson(elements: list) -> dict:
    features = []
    for el in elements:
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
            "nom": tags.get("name", ""),
            "adresse": tags.get("addr:full")
            or " ".join(
                filter(
                    None,
                    [
                        tags.get("addr:housenumber"),
                        tags.get("addr:street"),
                        tags.get("addr:postcode"),
                        tags.get("addr:city"),
                    ],
                )
            ),
            "telephone": tags.get("phone", tags.get("contact:phone", "")),
            "website": tags.get("website", tags.get("contact:website", "")),
        }
        props = {k: v for k, v in props.items() if v}

        features.append({"type": "Feature", "properties": props, "geometry": geom})

    features.sort(key=lambda f: (f["properties"].get("nom") or "").upper())
    return {
        "type": "FeatureCollection",
        "name": "casernes_sapeurs_pompiers_loire_42",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def fetch_overpass():
    data = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
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
    osm = fetch_overpass()

    geojson = osm_to_geojson(osm.get("elements", []))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"Exporté : {len(geojson['features'])} casernes -> {OUTPUT}")


if __name__ == "__main__":
    main()
