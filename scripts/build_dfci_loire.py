#!/usr/bin/env python3
"""Découpe le carroyage DFCI national (data.gouv.fr) pour la Loire (42)."""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import urllib.request
from pathlib import Path

# Même emprise que pmtiles/loire.json et build_elevation_loire.py
SOUTH, WEST, NORTH, EAST = 45.0, 3.5, 46.5, 5.0

# Simplification WGS84 (degrés) pour l'affichage Leaflet — recherche DFCI inchangée côté app.
DFCI_SIMPLIFY_TOLERANCE_DEG = {
    2: 0.00008,
    20: 0.0,
    100: 0.0,
}

DATASETS = {
    "2km": {
        "url": (
            "https://static.data.gouv.fr/resources/carroyage-dfci-france-2-km/"
            "20160607-104129/CARRO_DFCI_2x2_L93.7z"
        ),
        "archive": "CARRO_DFCI_2x2_L93.7z",
        "resolution_km": 2,
        "output": "dfci_2km_42.geojson",
    },
    "20km": {
        "url": (
            "https://static.data.gouv.fr/resources/carroyage-dfci-20-km/"
            "20160607-110958/CARRO_DFCI_20x20_L93.7z"
        ),
        "archive": "CARRO_DFCI_20x20_L93.7z",
        "resolution_km": 20,
        "output": "dfci_20km_42.geojson",
    },
    "100km": {
        "url": (
            "https://static.data.gouv.fr/resources/carroyage-dfci-100-km/"
            "20160615-140546/CARRO_DFCI_100x100_L93.7z"
        ),
        "archive": "CARRO_DFCI_100x100_L93.7z",
        "resolution_km": 100,
        "output": "dfci_100km_42.geojson",
    },
}


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  · cache : {dest.name}")
        return
    print(f"  · téléchargement : {dest.name}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, dest)


def find_shapefile(folder: Path) -> Path:
    shp_files = sorted(folder.rglob("*.shp"))
    if not shp_files:
        raise FileNotFoundError(f"Aucun shapefile dans {folder}")
    return shp_files[0]


def extract_7z(archive: Path, dest: Path) -> Path:
    import py7zr

    with py7zr.SevenZipFile(archive, mode="r") as zf:
        zf.extractall(path=dest)
    return find_shapefile(dest)


def code_column(columns: list[str]) -> str:
    for name in ("NOM", "nom", "DFCI", "dfci", "CODE", "code", "COORD_100", "COORD_20", "COORD_2"):
        if name in columns:
            return name
    for name in columns:
        if name.startswith("COORD_"):
            return name
    raise KeyError(f"Colonne code DFCI introuvable : {columns}")


def build_layer(
    key: str,
    cache_dir: Path,
    output_dir: Path,
    force: bool,
) -> Path:
    try:
        import geopandas as gpd
        from shapely.geometry import box
    except ImportError as exc:
        raise SystemExit(
            "Dépendances manquantes. Installez : pip install geopandas py7zr shapely"
        ) from exc

    meta = DATASETS[key]
    out_path = output_dir / meta["output"]
    if out_path.exists() and not force:
        print(f"Déjà présent : {out_path} (utilisez --force pour régénérer)")
        return out_path

    archive_path = cache_dir / meta["archive"]
    download(meta["url"], archive_path)

    with tempfile.TemporaryDirectory(prefix=f"dfci_{key}_") as tmp:
        tmp_path = Path(tmp)
        shp_path = extract_7z(archive_path, tmp_path)
        print(f"  · lecture : {shp_path.name}")
        gdf = gpd.read_file(shp_path)
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:2154")
        elif gdf.crs.to_epsg() != 2154:
            gdf = gdf.to_crs("EPSG:2154")

        bbox = box(WEST, SOUTH, EAST, NORTH)
        bbox_gdf = gpd.GeoDataFrame(geometry=[bbox], crs="EPSG:4326").to_crs(gdf.crs)
        clipped = gpd.clip(gdf, bbox_gdf)

        col = code_column(list(clipped.columns))
        clipped = clipped.to_crs("EPSG:4326")
        simplify_tol = DFCI_SIMPLIFY_TOLERANCE_DEG.get(meta["resolution_km"], 0.0)
        features = []
        for _, row in clipped.iterrows():
            code = str(row[col]).strip().upper()
            geom = row.geometry
            if simplify_tol > 0:
                geom = geom.simplify(simplify_tol, preserve_topology=True)
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "dfci": code,
                        "resolution_km": meta["resolution_km"],
                        "label": f"DFCI {code} ({meta['resolution_km']} km)",
                    },
                    "geometry": json.loads(gpd.GeoSeries([geom]).to_json())[
                        "features"
                    ][0]["geometry"],
                }
            )

        geojson = {"type": "FeatureCollection", "features": features}
        output_dir.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as fh:
            json.dump(geojson, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"  -> {out_path} ({len(features)} mailles)")
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "geojson" / "D42",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(__file__).resolve().parent / ".cache" / "dfci",
    )
    parser.add_argument(
        "--layers",
        nargs="+",
        choices=list(DATASETS),
        default=list(DATASETS),
        help="Résolutions à générer (défaut : 2km, 20km et 100km)",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if args.force and args.cache_dir.exists():
        shutil.rmtree(args.cache_dir, ignore_errors=True)

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    print(f"Emprise Loire : {SOUTH}°N–{NORTH}°N, {WEST}°E–{EAST}°E")
    for key in args.layers:
        print(f"\nCarroyage DFCI {key}…")
        build_layer(key, args.cache_dir, args.output_dir, args.force)
    print("\nTerminé.")


if __name__ == "__main__":
    main()
