#!/usr/bin/env python3
"""Vérifie la logique GeoJSON/KML minimale pour l'import Cartoff (hors navigateur)."""
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SAMPLE_KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test point</name>
      <Point><coordinates>4.0,45.5,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Test ligne</name>
      <LineString>
        <coordinates>4.0,45.5,0 4.1,45.6,0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"""


def test_geojson_sample():
    path = ROOT / "geojson" / "D42" / "Maire42.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) > 0
    print("OK GeoJSON sample:", path.name, len(data["features"]), "features")


def test_kml_coords_parse():
  # Vérifie que le KML test contient des coordonnées WGS84 attendues
    assert re.search(r"4\.0,45\.5", SAMPLE_KML)
    print("OK KML sample coords")


def test_kmz_roundtrip(tmp_name="test_import.kmz"):
    kmz_path = ROOT / "scripts" / tmp_name
    with zipfile.ZipFile(kmz_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", SAMPLE_KML)
    with zipfile.ZipFile(kmz_path, "r") as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".kml")]
        assert names, "no kml in kmz"
        kml = zf.read(names[0]).decode("utf-8")
        assert "Placemark" in kml
    kmz_path.unlink(missing_ok=True)
    print("OK KMZ zip structure")


def test_libs_present():
    for rel in ("js/jszip.min.js", "js/togeojson.js", "js/file-import.js"):
        p = ROOT / rel
        assert p.is_file() and p.stat().st_size > 1000, rel
        print("OK lib:", rel, p.stat().st_size, "bytes")


if __name__ == "__main__":
    test_libs_present()
    test_geojson_sample()
    test_kml_coords_parse()
    test_kmz_roundtrip()
    print("Tous les tests import OK")
