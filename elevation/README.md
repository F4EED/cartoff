# Altitude offline — Copernicus DEM (Loire)

Grille d'altitude (~30 m, dérivée **EU-DEM / Copernicus GLO-30**) pour l'emprise Cartoff : **45,0°–46,5° N**, **3,5°–5,0° E** (même borne que `pmtiles/loire.pmtiles`).

## Fichiers

| Fichier | Rôle | Versionné ? |
|---------|------|-------------|
| `loire_elev.meta.json` | Bornes, dimensions, nodata, transform raster | Oui |
| `loire_elev.bin` | Altitudes en **Int16** (mètres ; nodata = `-32768`) | Non (`.gitignore`, ~58 Mo) |

Dimensions typiques après génération : **5401 × 5400** cellules (~58 Mo).

## Génération (une fois, avec Internet)

**Prérequis :** Python 3, `rasterio`, `numpy`, `shapely`

```bash
pip install rasterio numpy shapely
python scripts/build_elevation_loire.py
```

Options :

```bash
python scripts/build_elevation_loire.py --force          # écraser les fichiers existants
python scripts/build_elevation_loire.py -o autre/dossier  # autre répertoire de sortie
```

Le script :

1. télécharge les dalles COG Copernicus DEM 30 m nécessaires depuis `copernicus-dem-30m.s3.eu-central-1.amazonaws.com` ;
2. fusionne et découpe l'emprise Loire ;
3. écrit `loire_elev.meta.json` et `loire_elev.bin` dans `elevation/` (par défaut).

Si les fichiers existent déjà, le script s'arrête sauf avec `--force`.

## Utilisation dans Cartoff

1. Générer la grille (ci-dessus) ou copier `loire_elev.bin` depuis une autre installation.
2. Lancer **`python serve.py`** à la racine du projet (le chargement via `fetch` ne fonctionne pas en `file://`).
3. Déplacer la souris sur la carte : la boîte en bas à gauche affiche **Alt.** (interpolation bilinéaire sur la grille, via `js/coords-utils.js`).

Hors emprise ou sans fichier binaire : affichage « — » ou « … » selon l'état de chargement.

## Licence et attribution

| Élément | Détail |
|---------|--------|
| Données | [Copernicus DEM GLO-30](https://spacedata.copernicus.eu/) (EU-DEM ~30 m) |
| Conditions | [Conditions d'utilisation Copernicus](https://spacedata.copernicus.eu/) — usage libre avec attribution |
| Attribution carte | « MNT [Copernicus DEM](https://spacedata.copernicus.eu/) » (voir `index.html` et [sources.md](../sources.md)) |
| Métadonnées | Champs `source` et `license` dans `loire_elev.meta.json` |
