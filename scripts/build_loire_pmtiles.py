#!/usr/bin/env python3
"""Extrait le fond Protomaps (OSM) pour l'emprise Loire en PMTiles local."""

from __future__ import annotations

import argparse
import subprocess
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

# Même emprise que pmtiles/loire.json et build_elevation_loire.py
WEST, SOUTH, EAST, NORTH = 3.5, 45.0, 5.0, 46.5
DEFAULT_MIN_ZOOM = 9
DEFAULT_MAX_ZOOM = 15  # maximum du build Protomaps (niveaux 0–15)
BUILD_BASE = "https://build.protomaps.com/{date}.pmtiles"


def find_latest_build(max_days_back: int = 14) -> str:
    today = date.today()
    for offset in range(max_days_back):
        day = today - timedelta(days=offset)
        url = BUILD_BASE.format(date=day.strftime("%Y%m%d"))
        req = urllib.request.Request(url, method="HEAD")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status == 200:
                    return url
        except OSError:
            continue
    raise RuntimeError(
        f"Aucun build Protomaps trouvé sur les {max_days_back} derniers jours."
    )


def run_extract(
    pmtiles_exe: Path,
    build_url: str,
    output: Path,
    min_zoom: int,
    max_zoom: int,
    download_threads: int,
    force: bool,
) -> None:
    if output.exists() and not force:
        raise FileExistsError(
            f"{output} existe déjà. Utilisez --force pour écraser."
        )
    if force and output.exists():
        output.unlink()

    bbox = f"{WEST},{SOUTH},{EAST},{NORTH}"
    cmd = [
        str(pmtiles_exe),
        "extract",
        build_url,
        str(output),
        f"--bbox={bbox}",
        f"--minzoom={min_zoom}",
        f"--maxzoom={max_zoom}",
        f"--download-threads={download_threads}",
    ]
    print("Commande :", " ".join(cmd))
    subprocess.run(cmd, check=True)

    verify = subprocess.run(
        [str(pmtiles_exe), "verify", str(output)],
        capture_output=True,
        text=True,
    )
    if verify.returncode != 0:
        output.unlink(missing_ok=True)
        raise RuntimeError(f"Vérification PMTiles échouée :\n{verify.stderr}")

    show = subprocess.run(
        [str(pmtiles_exe), "show", str(output)],
        capture_output=True,
        text=True,
        check=True,
    )
    size_mb = output.stat().st_size / 1024 / 1024
    print(f"\nFichier généré : {output} ({size_mb:.2f} Mo)")
    print(show.stdout)


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Extrait loire.pmtiles depuis le build quotidien Protomaps."
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=root / "pmtiles" / "loire.pmtiles",
        help="Fichier PMTiles de sortie (défaut : pmtiles/loire.pmtiles)",
    )
    parser.add_argument(
        "--build-url",
        default=None,
        help="URL du build Protomaps (défaut : dernier build disponible)",
    )
    parser.add_argument(
        "--min-zoom",
        type=int,
        default=DEFAULT_MIN_ZOOM,
        help=f"Zoom minimum inclus (défaut : {DEFAULT_MIN_ZOOM})",
    )
    parser.add_argument(
        "--max-zoom",
        type=int,
        default=DEFAULT_MAX_ZOOM,
        help=f"Zoom maximum inclus (défaut : {DEFAULT_MAX_ZOOM})",
    )
    parser.add_argument(
        "--download-threads",
        type=int,
        default=8,
        help="Threads de téléchargement parallèle (défaut : 8)",
    )
    parser.add_argument(
        "--pmtiles-exe",
        type=Path,
        default=root / "pmtiles" / "tools" / "pmtiles.exe",
        help="Chemin vers pmtiles.exe",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Écraser le fichier de sortie s'il existe",
    )
    args = parser.parse_args()

    if not args.pmtiles_exe.is_file():
        print(f"Erreur : binaire introuvable : {args.pmtiles_exe}", file=sys.stderr)
        return 1

    try:
        build_url = args.build_url or find_latest_build()
        print(f"Build source : {build_url}")
        run_extract(
            args.pmtiles_exe,
            build_url,
            args.output,
            args.min_zoom,
            args.max_zoom,
            args.download_threads,
            args.force,
        )
    except (OSError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
