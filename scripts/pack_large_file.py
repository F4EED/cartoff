#!/usr/bin/env python3
"""Découpe un gros fichier en morceaux <= 70 Mo pour contourner la limite GitHub (100 Mo)."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

DEFAULT_CHUNK_SIZE = 70 * 1024 * 1024  # 70 Mo
BUFFER_SIZE = 8 * 1024 * 1024


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(BUFFER_SIZE):
            h.update(chunk)
    return h.hexdigest()


def pack(source: Path, chunk_size: int, output_dir: Path | None) -> Path:
    if not source.is_file():
        raise FileNotFoundError(f"Fichier introuvable : {source}")

    out_dir = output_dir or source.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    for old_part in out_dir.glob(f"{source.name}.part*"):
        old_part.unlink()

    total_size = source.stat().st_size
    if total_size <= chunk_size:
        print(f"Aucun découpage nécessaire ({total_size / 1024 / 1024:.2f} Mo <= limite).")
        return out_dir

    print(f"Découpage de {source.name} ({total_size / 1024 / 1024:.2f} Mo)...")
    chunks: list[dict] = []
    part_num = 0

    with source.open("rb") as src:
        while True:
            data = src.read(chunk_size)
            if not data:
                break
            part_num += 1
            part_name = f"{source.name}.part{part_num:03d}"
            part_path = out_dir / part_name
            part_path.write_bytes(data)
            chunks.append({"name": part_name, "size": len(data)})
            print(f"  -> {part_name} ({len(data) / 1024 / 1024:.2f} Mo)")

    manifest = {
        "source": source.name,
        "size": total_size,
        "sha256": sha256_file(source),
        "chunk_size": chunk_size,
        "chunks": chunks,
    }
    manifest_path = out_dir / f"{source.name}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Manifeste : {manifest_path.name} ({len(chunks)} morceau(x))")
    return manifest_path


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Découpe un fichier volumineux en morceaux de 70 Mo max (limite GitHub)."
    )
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=root / "pmtiles" / "loire.pmtiles",
        help="Fichier à découper (défaut : pmtiles/loire.pmtiles)",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=None,
        help="Répertoire de sortie (défaut : même dossier que le fichier source)",
    )
    parser.add_argument(
        "--chunk-size-mb",
        type=int,
        default=70,
        help="Taille max de chaque morceau en Mo (défaut : 70)",
    )
    args = parser.parse_args()

    try:
        pack(args.source, args.chunk_size_mb * 1024 * 1024, args.output_dir)
    except (OSError, FileNotFoundError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
