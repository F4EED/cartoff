#!/usr/bin/env python3
"""Reconstitue un fichier découpé à partir de son manifeste (.manifest.json)."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

BUFFER_SIZE = 8 * 1024 * 1024


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(BUFFER_SIZE):
            h.update(chunk)
    return h.hexdigest()


def unpack(manifest_path: Path, output: Path | None, force: bool) -> Path:
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Manifeste introuvable : {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base_dir = manifest_path.parent
    target = output or (base_dir / manifest["source"])

    if target.exists() and not force:
        raise FileExistsError(
            f"{target} existe déjà. Utilisez --force pour écraser."
        )

    chunks = manifest.get("chunks")
    if not chunks:
        raise ValueError("Manifeste invalide : aucun morceau listé.")

    print(f"Reconstitution de {target.name} ({manifest['size'] / 1024 / 1024:.2f} Mo)...")
    written = 0
    with target.open("wb") as out:
        for entry in chunks:
            part_path = base_dir / entry["name"]
            if not part_path.is_file():
                raise FileNotFoundError(f"Morceau manquant : {part_path}")
            print(f"  <- {entry['name']}")
            with part_path.open("rb") as part:
                while block := part.read(BUFFER_SIZE):
                    out.write(block)
                    written += len(block)

    if written != manifest["size"]:
        target.unlink(missing_ok=True)
        raise ValueError(
            f"Taille incorrecte : attendu {manifest['size']}, obtenu {written}"
        )

    expected_hash = manifest.get("sha256")
    if expected_hash:
        actual_hash = sha256_file(target)
        if actual_hash != expected_hash:
            target.unlink(missing_ok=True)
            raise ValueError(
                "Contrôle d'intégrité SHA-256 échoué — fichier supprimé."
            )
        print("Contrôle SHA-256 : OK")

    print(f"Fichier reconstitué : {target}")
    return target


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Reconstitue un fichier découpé via pack_large_file.py."
    )
    parser.add_argument(
        "manifest",
        nargs="?",
        type=Path,
        default=root / "pmtiles" / "loire.pmtiles.manifest.json",
        help="Chemin du manifeste (défaut : pmtiles/loire.pmtiles.manifest.json)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Fichier de sortie (défaut : chemin indiqué dans le manifeste)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Écraser le fichier cible s'il existe déjà",
    )
    args = parser.parse_args()

    try:
        unpack(args.manifest, args.output, args.force)
    except (OSError, ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
