#!/usr/bin/env python3
"""Construit la grille d'altitude offline (Copernicus DEM ~30 m) pour la Loire."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Même emprise que pmtiles/loire.json
SOUTH, WEST, NORTH, EAST = 45.0, 3.5, 46.5, 5.0
NODATA = -32768
COG_BASE = (
    "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
    "{name}/{name}.tif"
)


def tile_name(lat_deg: int, lon_deg: int) -> str:
    lat_hem = "N" if lat_deg >= 0 else "S"
    lon_hem = "E" if lon_deg >= 0 else "W"
    return (
        f"Copernicus_DSM_COG_10_{lat_hem}{abs(lat_deg):02d}_00_"
        f"{lon_hem}{abs(lon_deg):03d}_00_DEM"
    )


def needed_tiles(south: float, west: float, north: float, east: float) -> list[str]:
    tiles: list[str] = []
    for lat in range(int(south), int(north) + 1):
        for lon in range(int(west), int(east) + 1):
            tiles.append(tile_name(lat, lon))
    return sorted(set(tiles))


def build(output_dir: Path, force: bool) -> None:
    try:
        import numpy as np
        import rasterio
        from rasterio.merge import merge
        from rasterio.mask import mask as rio_mask
        from shapely.geometry import box
    except ImportError as exc:
        raise SystemExit(
            "Dépendances manquantes. Installez : pip install rasterio numpy shapely"
        ) from exc

    output_dir.mkdir(parents=True, exist_ok=True)
    meta_path = output_dir / "loire_elev.meta.json"
    bin_path = output_dir / "loire_elev.bin"

    if meta_path.exists() and bin_path.exists() and not force:
        print(f"Déjà présent : {bin_path} (utilisez --force pour régénérer)")
        return

    tiles = needed_tiles(SOUTH, WEST, NORTH, EAST)
    print(f"Téléchargement de {len(tiles)} dalle(s) Copernicus DEM…")
    datasets = []
    try:
        for name in tiles:
            url = COG_BASE.format(name=name)
            print(f"  · {name}")
            datasets.append(rasterio.open(url))
        mosaic, transform = merge(datasets)
        profile = datasets[0].profile.copy()
        profile.update(
            height=mosaic.shape[1],
            width=mosaic.shape[2],
            transform=transform,
            count=1,
            dtype=mosaic.dtype,
        )
        from rasterio.io import MemoryFile

        bbox = box(WEST, SOUTH, EAST, NORTH)
        with MemoryFile() as memfile:
            with memfile.open(**profile) as dst:
                dst.write(mosaic)
                clipped, clip_transform = rio_mask(
                    dst, [bbox], crop=True, filled=False, nodata=np.nan
                )
    finally:
        for ds in datasets:
            ds.close()

    band = np.ma.filled(clipped[0].astype("float32"), np.nan)
    band[~np.isfinite(band)] = NODATA
    heights = np.rint(band).astype(np.int16)
    heights[heights < -500] = NODATA
    heights[heights > 5000] = NODATA

    rows, cols = heights.shape
    meta = {
        "source": "Copernicus DEM GLO-30 (EU-DEM ~30 m)",
        "license": "Copernicus — usage libre (voir https://spacedata.copernicus.eu/)",
        "south": SOUTH,
        "west": WEST,
        "north": NORTH,
        "east": EAST,
        "rows": rows,
        "cols": cols,
        "nodata": NODATA,
        "crs": "EPSG:4326",
        "transform": [clip_transform.a, clip_transform.b, clip_transform.c,
                      clip_transform.d, clip_transform.e, clip_transform.f],
    }

    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    heights.tofile(bin_path)

    size_mb = bin_path.stat().st_size / 1024 / 1024
    print(f"Grille : {cols} x {rows} ({size_mb:.1f} Mo)")
    print(f"Écrit : {meta_path}")
    print(f"Écrit : {bin_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Télécharge et découpe le MNT Copernicus DEM pour la Loire."
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "elevation",
        help="Dossier de sortie (défaut : elevation/)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Écraser les fichiers existants",
    )
    args = parser.parse_args()
    build(args.output, args.force)


if __name__ == "__main__":
    main()
