# Cartoff

Cartographie **hors ligne** pour l'aide à la gestion de crise — département de la Loire (42) et environs.

Le manque d'un outil pour la gestion de crise est à l'origine du projet. Une veille technologique autour de Leaflet a permis d'assembler fond de carte vectoriel, calques GeoJSON (OpenStreetMap) et outils de localisation (UTM, DFCI, altitude).

## Démarrage rapide

**Prérequis :** Python 3 (aucune dépendance pour le serveur).

1. **Reconstituer le fond PMTiles** (fichier > 100 Mo, découpé pour GitHub) :

   ```bash
   python scripts/unpack_large_file.py
   ```

   Voir [pmtiles/README.md](pmtiles/README.md) pour le détail.

2. **(Optionnel) Générer la grille d'altitude** Copernicus DEM (~58 Mo, non versionnée) :

   ```bash
   pip install rasterio numpy shapely
   python scripts/build_elevation_loire.py
   ```

   Voir [elevation/README.md](elevation/README.md).

3. **Lancer la carte** (obligatoire : serveur HTTP, pas `file://`) :

   ```bash
   python serve.py
   ```

   Ouvrir http://localhost:8000/ — le serveur gère les requêtes **HTTP Range** requises par PMTiles.

## Fonctionnalités

| Élément | Description |
|---------|-------------|
| Fond de carte | `pmtiles/loire.pmtiles` via [protomaps-leaflet](https://github.com/protomaps/PMTiles) (`flavor: light`, `lang: fr`) |
| Calques | GeoJSON OSM (urgence, santé, aviation, toponymie, etc.) — cases à cocher dans la barre latérale |
| Boîte de coordonnées | Commune (contours OSM), lat/lon, zoom, **UTM**, **DFCI** (carreau 2 km), **altitude** (MNT offline) |
| Emprise | 45,0°–46,5° N, 3,5°–5,0° E (zoom 9–14) |

Algorithmes de coordonnées : `js/coords-utils.js` (proj4 pour UTM ; DFCI sur grille Lambert II étendu — voir [sources.md](sources.md)).

## Les étapes pour adapter le projet

- Une vraie analyse de vos besoins.
- Une recherche des données : une partie est fournie ici (OSM, Copernicus DEM) ; d'autres peuvent provenir de l'IGN (BDTOPO, etc.).
- Une mise en forme GeoJSON — tester vos fichiers `.geojson`.
- Adapter `index.html` (liste `geojsonFiles`, styles, légende).
- Placer le PMTiles dans `pmtiles/` (voir [Valentin Saugnier / map.gaulix.fr](https://github.com/valentintintin)).
- Servir via un serveur web (`python serve.py`, nginx, etc.).

## Fichiers volumineux

| Fichier | Taille typique | Dans Git ? | Restauration |
|---------|----------------|------------|--------------|
| `pmtiles/loire.pmtiles` | ~132 Mo | Non (morceaux `.part*`) | `python scripts/unpack_large_file.py` |
| `elevation/loire_elev.bin` | ~58 Mo | Non (`.gitignore`) | `python scripts/build_elevation_loire.py` |
| `elevation/loire_elev.meta.json` | quelques Ko | Oui | — |

Scripts : `scripts/pack_large_file.py`, `scripts/unpack_large_file.py`.

## Sources et licences

Recensement détaillé : **[sources.md](sources.md)** (OSM, Copernicus DEM, DFCI, IGN, bibliothèques).

Attributions affichées dans la carte : OpenStreetMap, Copernicus DEM (altitude).

## Votre attention

Je ne suis ni :

- Développeur
- Informaticien
- Cartographe

Juste curieux de nature et à la recherche de solutions libres, open source, qui peuvent accompagner collectivités, associations et citoyens dans la gestion de crise — avec un investissement financier modeste et un investissement de temps plus long qu'une solution sur étagère.

## Ils m'ont bien aidé

- [Valentin Saugnier](https://github.com/valentintintin)
- ChatGPT (oui je sais ce n'est pas bien, mais quand tu n'es pas développeur ça aide — la preuve)

## Inspirations

- [map.gaulix.fr](https://github.com/valentintintin)

## Conclusion

- Ce projet évoluera, mais pas forcément beaucoup ni rapidement.
- Je vous mets le projet à disposition tel quel, sans garantie.
- Si vous en faites un vrai outil de gestion de crise, je suis éventuellement preneur d'un retour (frederic.f4eed at gmail.com).

Bref amusez-vous, apprenez et partagez — finalement cela fait plaisir !

<img width="1913" height="1034" alt="image" src="https://github.com/user-attachments/assets/c4573301-cb96-4a46-9c80-a29d211f9a8f" />
