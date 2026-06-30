# Base carto PMTiles — fichiers découpés

Sources et attributions : fond **OpenStreetMap** (PMTiles + calques GeoJSON), altitude **Copernicus DEM** — voir [sources.md](../sources.md).

Le fichier `loire.pmtiles` (~260 Mo, zoom 9–15) dépasse la limite GitHub de **100 Mo par fichier**. Il n’est donc **pas versionné** tel quel (voir `.gitignore`).

À la place, le dépôt contient :

| Fichier | Rôle |
|---------|------|
| `loire.pmtiles.part001` | 1er morceau (70 Mo max) |
| `loire.pmtiles.part002` | 2e morceau |
| `loire.pmtiles.part003` | … |
| `loire.pmtiles.manifest.json` | Manifeste (tailles, liste des morceaux, empreinte SHA-256) |

Les scripts de découpage et de restauration se trouvent dans `scripts/` :

- `build_loire_pmtiles.py` — extrait le fond depuis le build quotidien Protomaps
- `pack_large_file.py` — découpe un gros fichier en morceaux
- `unpack_large_file.py` — reconstitue le fichier original

---

## Restauration après `git clone`

**Prérequis :** Python 3 (aucune dépendance externe).

Depuis la racine du projet :

```bash
python scripts/unpack_large_file.py
```

Cette commande :

1. lit `pmtiles/loire.pmtiles.manifest.json` ;
2. assemble les morceaux `loire.pmtiles.part001`, `loire.pmtiles.part002`, etc. ;
3. recrée `pmtiles/loire.pmtiles` ;
4. vérifie la taille et l’empreinte SHA-256.

En cas de succès, vous devriez voir :

```
Contrôle SHA-256 : OK
Fichier reconstitué : pmtiles\loire.pmtiles
```

### Si le fichier existe déjà

```bash
python scripts/unpack_large_file.py --force
```

### Options utiles

```bash
# Manifeste ou sortie personnalisés
python scripts/unpack_large_file.py pmtiles/loire.pmtiles.manifest.json
python scripts/unpack_large_file.py -o chemin/vers/sortie.pmtiles
```

---

## Lancer la carte

`loire.pmtiles` doit être présent dans `pmtiles/` pour que le fond de carte s’affiche dans `index.html` (zoom **9 à 15**).

Servez le projet via un serveur web (pas en `file://`) :

```bash
python serve.py
```

Depuis la racine du dépôt — voir aussi [README.md](../README.md).

Le serveur `serve.py` gère les requêtes **HTTP Range** nécessaires au format PMTiles (port 8000 par défaut, option `-p`).

### Autre gros fichier : altitude

Le MNT Copernicus (`elevation/loire_elev.bin`, ~58 Mo) suit le même principe : non versionné, à générer avec `python scripts/build_elevation_loire.py` — voir [elevation/README.md](../elevation/README.md).

---

## Regénérer `loire.pmtiles` (zoom 15)

Le fond est extrait du **build quotidien Protomaps** (basemap OSM v4) pour l’emprise **45,0°–46,5° N**, **3,5°–5,0° E** — identique à `pmtiles/loire.json`.

> **Note :** le build Protomaps actuel couvre les niveaux **0 à 15** (pas de tuiles z16). C’est le maximum disponible pour ce fond vectoriel.

**Prérequis :** connexion Internet, `pmtiles/tools/pmtiles.exe` (go-pmtiles).

```bash
python scripts/build_loire_pmtiles.py --force
```

Le script détecte automatiquement le dernier build disponible sur `build.protomaps.com`, télécharge les tuiles nécessaires (~260 Mo, quelques minutes) et écrit `pmtiles/loire.pmtiles`.

Options utiles :

```bash
python scripts/build_loire_pmtiles.py --build-url https://build.protomaps.com/20260629.pmtiles
python scripts/build_loire_pmtiles.py --max-zoom 15 --min-zoom 9
```

Équivalent manuel avec le CLI :

```bash
pmtiles/tools/pmtiles.exe extract https://build.protomaps.com/YYYYMMDD.pmtiles pmtiles/loire.pmtiles ^
  --bbox=3.5,45.0,5.0,46.5 --minzoom=9 --maxzoom=15 --download-threads=8
```

Remplacez `YYYYMMDD` par une date récente listée sur [maps.protomaps.com/builds](https://maps.protomaps.com/builds/).

---

## Découper pour GitHub (mise à jour des morceaux)

Une fois `loire.pmtiles` généré en local :

```bash
python scripts/pack_large_file.py
```

Par défaut, le script découpe `pmtiles/loire.pmtiles` en morceaux de **70 Mo** maximum, supprime les anciens `.part*` et régénère le manifeste.

Puis versionnez les nouveaux morceaux et le manifeste (pas le `.pmtiles` complet) :

```bash
git add pmtiles/loire.pmtiles.part* pmtiles/loire.pmtiles.manifest.json
```

---

## Dépannage

| Problème | Piste |
|----------|-------|
| `Morceau manquant` | Vérifiez que tous les fichiers `.part00X` listés dans le manifeste sont présents (clone incomplet ?). |
| `Contrôle d'intégrité SHA-256 échoué` | Un morceau est corrompu ou tronqué ; retéléchargez depuis le dépôt ou regénérez avec `pack_large_file.py`. |
| `existe déjà` | Utilisez `--force` ou supprimez l’ancien `loire.pmtiles` avant de relancer. |
| Fond de carte vide | Confirmez que `pmtiles/loire.pmtiles` existe et que vous utilisez un serveur web (`python serve.py`). |
| Zoom trop faible (fond gris) | Les tuiles détaillées commencent au zoom **9** (`PMTILES_MIN_ZOOM` dans `index.html`). |

---

## Note sur la compression

Une compression gzip du PMTiles n’apporte pas de gain (le format est déjà optimisé). Seul le **découpage** permet de rester sous la limite GitHub.
