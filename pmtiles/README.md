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

Métadonnées d’emprise : `loire.json` (`min_zoom: 9`, `max_zoom: 15`, bbox 45,0°–46,5° N × 3,5°–5,0° E).

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
# Windows (recommandé) : libère le port 8000, vérifie loire.pmtiles, lance serve.py
start.bat

# Ou manuellement
python serve.py -p 8000
```

Depuis la racine du dépôt — voir aussi [README.md](../README.md).

Le serveur `serve.py` gère les requêtes **HTTP Range** (réponse 206) nécessaires au format PMTiles (port 8000 par défaut, option `-p`). Au démarrage, il avertit si `loire.pmtiles` est absent.

⚠️ **Ne pas utiliser** `python -m http.server` : pas de support HTTP Range → fond gris.

### Configuration Leaflet (`levelDiff`)

Le fichier `loire.pmtiles` ne contient **aucune tuile en dessous du zoom 9** (`min_zoom: 9` dans `loire.json`).

Dans `index.html`, le fond est créé ainsi :

```javascript
protomapsL.leafletLayer({
  url: pmtilesUrl,
  flavor: "light",
  lang: "fr",
  levelDiff: 0   // obligatoire — le défaut (1) demande z8 à l'affichage z9
});
```

Sans `levelDiff: 0`, protomaps-leaflet demande des tuiles au niveau **z8** lorsque la carte est au zoom **9** ; ces tuiles n’existent pas dans l’archive → **fond gris** même avec un serveur correct.

La carte impose aussi `minZoom: 9` et `maxZoom: 15` (`PMTILES_MIN_ZOOM` / `PMTILES_MAX_ZOOM`).

### Vérification automatique

Au chargement, `index.html` teste une requête `Range: bytes=0-16383` sur `pmtiles/loire.pmtiles`. Si la réponse n’est pas **206** avec `Accept-Ranges: bytes`, un message d’erreur s’affiche dans la boîte de coordonnées.

### Autre gros fichier : altitude

Le MNT Copernicus (`elevation/loire_elev.bin`, ~58 Mo) suit le même principe : non versionné, à générer avec `python scripts/build_elevation_loire.py` — voir [elevation/README.md](../elevation/README.md).

---

## Créer un PMTiles pour votre région

La procédure ci-dessous généralise l’exemple Loire. Le dépôt fournit `scripts/build_loire_pmtiles.py` et `pmtiles/tools/pmtiles.exe` (go-pmtiles).

### 1. Emprise et niveaux de zoom

1. **BBox** : `ouest,sud,est,nord` en degrés décimaux WGS84 (ex. Loire : `3.5,45.0,5.0,46.5` — voir `pmtiles/loire.json`).
2. **`minzoom`** : premier niveau de tuiles **inclus** dans l’archive. Plus il est bas, plus le fichier grossit. Pour une région départementale, **9** est un bon compromis (comme Loire).
3. **`maxzoom`** : dernier niveau inclus. Le build Protomaps actuel s’arrête à **15** (pas de z16).

Documentez ces valeurs dans un fichier JSON (ex. `pmtiles/ma-region.json`) : `bounds`, `min_zoom`, `max_zoom`.

### 2. Extraction

**Script** (détecte le dernier build sur `build.protomaps.com`) — adapter d’abord `WEST,SOUTH,EAST,NORTH` dans `scripts/build_loire_pmtiles.py` (L14), ou passer par le CLI :

```bash
python scripts/build_loire_pmtiles.py --min-zoom 9 --max-zoom 15 -o pmtiles/ma-region.pmtiles --force
```

**CLI manuel** (bbox libre sans modifier le script) :

```bash
pmtiles/tools/pmtiles.exe extract https://build.protomaps.com/YYYYMMDD.pmtiles pmtiles/ma-region.pmtiles ^
  --bbox=OUEST,SUD,EST,NORD --minzoom=9 --maxzoom=15 --download-threads=8
```

Dates récentes : [maps.protomaps.com/builds](https://maps.protomaps.com/builds/).

### 3. Fichier > 100 Mo (GitHub)

```bash
python scripts/pack_large_file.py pmtiles/ma-region.pmtiles
```

Génère `ma-region.pmtiles.part001`, … et `ma-region.pmtiles.manifest.json`. Versionnez les morceaux et le manifeste (pas le `.pmtiles` complet). Restauration :

```bash
python scripts/unpack_large_file.py pmtiles/ma-region.pmtiles.manifest.json
```

### 4. Checklist — remplacer `loire.pmtiles`

| Fichier | À modifier |
|---------|------------|
| **`index.html`** (~L810) | URL `pmtiles/loire.pmtiles` → votre fichier |
| **`index.html`** (~L793–795) | `LOIRE_BOUNDS`, `PMTILES_MIN_ZOOM`, `PMTILES_MAX_ZOOM` (alignés sur bbox et zooms de l’archive) |
| **`index.html`** (~L816) | `levelDiff: 0` si `minzoom ≥ 9` (voir ci-dessous) |
| **`serve.py`** (L118) | Chemin du PMTiles vérifié au démarrage |
| **`start.bat`** (L13–17) | Test d’existence + appel `unpack_large_file.py` avec le bon manifeste |
| **`.gitignore`** | Ignorer le `.pmtiles` complet (ex. `pmtiles/ma-region.pmtiles`) |
| **Manifeste** | Régénéré par `pack_large_file.py` (`source`, noms `.part*`) |

Scripts optionnels (défauts ou arguments) : `pack_large_file.py`, `unpack_large_file.py`, `build_loire_pmtiles.py` (`-o`).

Pour une **autre emprise** (pas seulement le nom) : adapter aussi `scripts/build_elevation_loire.py`, les calques `geojson/`, et le centre initial dans `index.html` (~L1003).

### 5. `levelDiff: 0` quand `minzoom ≥ 9`

Un extrait régional sans tuiles sous le zoom **N** doit utiliser **`levelDiff: 0`** dans `protomapsL.leafletLayer` : au zoom carte **Z**, les tuiles demandées sont au zoom **Z**.

Le défaut protomaps-leaflet (`levelDiff: 1`) demande des tuiles **z8** à l’affichage **z9** — absentes d’un extrait `minzoom=9` → **fond gris**.

Règle : `PMTILES_MIN_ZOOM` = `minzoom` de l’archive + **`levelDiff: 0`**.

Servez via `start.bat` ou `python serve.py` → **http://localhost:8000/** (HTTP Range requis).

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
| Fond gris, protocole `file://` | Ouvrez **http://localhost:8000/** — lancez `start.bat` ou `python serve.py`. |
| Fond gris, `python -m http.server` | Fermez ce serveur ; utilisez `serve.py` (HTTP Range requis). |
| Fond gris, bon serveur Cartoff | Vérifiez `levelDiff: 0` dans `index.html` ; confirmez que `loire.pmtiles` existe (`unpack_large_file.py`). |
| Message « HTTP Range requis » | Le serveur ne renvoie pas 206 ; utilisez `serve.py` ou `start.bat`. |
| Zoom trop faible (fond gris) | Les tuiles détaillées commencent au zoom **9** ; la carte ne descend pas en dessous. |
| Port 8000 occupé | `start.bat` tue les processus sur ce port ; sinon `netstat -ano \| findstr :8000`. |

---

## Note sur la compression

Une compression gzip du PMTiles n’apporte pas de gain (le format est déjà optimisé). Seul le **découpage** permet de rester sous la limite GitHub.
