# Sources de données — Cartoff

Ce document recense les sources utilisées dans le projet **Cartoff** (cartographie hors ligne pour la gestion de crise, département de la Loire — 42).

Dernière mise à jour : juin 2026.

---

## Fond de carte

| Élément | Source | Licence / remarques |
|---------|--------|----------------------|
| `pmtiles/loire.pmtiles` | Tuiles vectorielles au format [PMTiles](https://github.com/protomaps/PMTiles), affichées via [protomaps-leaflet](https://github.com/protomaps/PMTiles) (`flavor: light`, `lang: fr`) | Données cartographiques issues d'[OpenStreetMap](https://www.openstreetmap.org/) ; approche inspirée de [map.gaulix.fr](https://github.com/valentintintin) (Valentin Saugnier). Fichier découpé pour GitHub — voir `pmtiles/README.md`. |
| Tuiles OSM en ligne (alternative commentée) | [OpenStreetMap](https://www.openstreetmap.org/) — `tile.openstreetmap.org` | Non utilisée par défaut ; présente en commentaire dans `index.html`. |

---

## Altitude (MNT offline)

| Élément | Source | Licence / remarques |
|---------|--------|----------------------|
| `elevation/loire_elev.bin` | [Copernicus DEM GLO-30](https://spacedata.copernicus.eu/) (EU-DEM ~30 m), dalles COG sur `copernicus-dem-30m.s3.eu-central-1.amazonaws.com` | Usage libre selon les [conditions Copernicus](https://spacedata.copernicus.eu/) — voir aussi le champ `license` dans `elevation/loire_elev.meta.json`. |
| `elevation/loire_elev.meta.json` | Métadonnées générées par `scripts/build_elevation_loire.py` | Emprise : 45,0°–46,5° N, 3,5°–5,0° E (identique au fond PMTiles). |
| Script de génération | `scripts/build_elevation_loire.py` | Nécessite `rasterio`, `numpy`, `shapely` et une connexion Internet pour le téléchargement initial. |

Le binaire `loire_elev.bin` n'est pas versionné (`.gitignore`, ~58 Mo). Voir `elevation/README.md`.

**Attribution :** « MNT Copernicus DEM » — [https://spacedata.copernicus.eu/](https://spacedata.copernicus.eu/)

---

## Boîte de coordonnées (UTM, DFCI, commune, altitude)

| Composant | Source | Usage |
|-----------|--------|-------|
| `js/coords-utils.js` | Implémentation Cartoff | UTM (WGS84), DFCI (Lambert II étendu), point-dans-polygone pour la commune, interpolation bilinéaire sur la grille d'altitude |
| [proj4js](https://github.com/proj4js/proj4js) (`js/proj4-src.js`) | MIT | Conversion WGS84 → UTM |
| Carroyage DFCI | Spécification publique « Défense des Forêts Contre les Incendies » sur **Lambert II étendu** | Jeux de référence : [Carroyage DFCI 100 km](https://www.data.gouv.fr/datasets/carroyage-dfci-100-km), [20 km](https://www.data.gouv.fr/datasets/carroyage-dfci-20-km), [2 km](https://www.data.gouv.fr/datasets/carroyage-dfci-2-km) (Licence Ouverte). Présentation : [IGN / Iphigénie — systèmes de coordonnées](https://www.iphigen.ie/blog-posts/les-systemes-de-coordonnees-carte-ing). |
| Contours communaux | `geojson/D42/communes_contours_osm_42.geojson` | Nom de commune affiché au survol (calque « Contours communes (OSM) ») |

**Algorithme DFCI** (`latLngToDfci` dans `coords-utils.js`) :

1. WGS84 → NTF (ellipsoïde Clarke 1880, méridien de Paris) ;
2. NTF → Lambert II étendu (constantes `L2E`) ;
3. Découpage en carreaux 100 km / 20 km / 2 km selon la numérotation DFCI (6 caractères de base ; sous-division `.1`–`.5` calculée mais non affichée dans l'interface).

**Remarque :** le DFCI historique repose sur Lambert II étendu ; depuis 2009 des référentiels officiels existent aussi en Lambert 93. L'implémentation suit la grille Lambert II étendu pour compatibilité avec les usages pompiers / feux de forêt.

---

## OpenStreetMap (via Overpass API)

Les calques suffixés `*_osm_42` sont extraits du département 42 (`area["ISO3166-2"="FR-42"]`) à l'aide de l'[Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), via les scripts Python du dossier `scripts/`.

**Points d'accès utilisés :**

- https://overpass.kumi.systems/api/interpreter
- https://overpass-api.de/api/interpreter

**Licence :** [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/) — © contributeurs OpenStreetMap.

### Calques branchés dans `index.html`

Tous les calques ci-dessous sont listés dans `geojsonFiles` (`index.html`).

| Calque (UI) | Fichier | Script d'export | Critères OSM principaux |
|-------------|---------|-----------------|-------------------------|
| Contours communes (OSM) | `communes_contours_osm_42.geojson` | `export_osm_communes_42.py` | `boundary=administrative`, `admin_level=8` |
| Zones industrielles (OSM) | `zones_industrielles_osm_42.json` | `export_osm_risques_42.py` | `landuse=industrial` |
| Sites industriels (OSM) | `sites_industriels_osm_42.json` | `export_osm_risques_42.py` | `man_made=works` |
| Zones d'habitation (OSM) | `zones_habitation_osm_42.json` | `export_osm_toponymie_42.py` | `landuse=residential` |
| Aérodromes (OSM) | `aerodromes_osm_42.geojson` | `export_osm_aerodromes_42.py` | `aeroway=aerodrome` |
| Héliports (OSM) | `helipads_osm_42.geojson` | `export_osm_helipads_42.py` | `aeroway=helipad` |
| Points de rassemblement (OSM) | `points_rassemblement_osm_42.json` | `export_osm_risques_42.py` | `emergency=assembly_point` |
| Bouches à incendie (OSM) | `bouches_incendie_osm_42.json` | `export_osm_risques_42.py` | `emergency=fire_hydrant` |
| Abris (OSM) | `abris_osm_42.json` | `export_osm_risques_42.py` | `amenity=shelter` |
| Hôpitaux (OSM) | `hopitaux_osm_42.geojson` | `export_osm_sante_42.py` | `amenity=hospital` |
| Cliniques (OSM) | `cliniques_osm_42.geojson` | `export_osm_sante_42.py` | `amenity=clinic` |
| Pharmacies (OSM) | `pharmacies_osm_42.geojson` | `export_osm_sante_42.py` | `amenity=pharmacy` |
| Mairies (OSM) | `Maire42.json` | `export_osm_mairies_gendarmerie_42.py` | `amenity=townhall` |
| Gendarmerie (OSM) | `gendarmerie 42.json` | `export_osm_mairies_gendarmerie_42.py` | `amenity=police`, `police:FR=gendarmerie` |
| Casernes sapeurs-pompiers (OSM) | `casernes_osm_42.geojson` | `export_osm_casernes_42.py` | `amenity=fire_station` |
| Police nationale (OSM) | `police_nationale_osm_42.geojson` | `export_osm_police_nationale_42.py` | `amenity=police`, `police:FR=police` |
| Cimetières (OSM) | `cimetieres_osm_42.json` | `export_osm_contexte_42.py` | `landuse=cemetery` |
| Administrations (OSM) | `services_publics_osm_42.json` | `export_osm_contexte_42.py` | `office=government` |
| Déchèteries (OSM) | `decheteries_osm_42.json` | `export_osm_contexte_42.py` | `amenity=waste_transfer_station` |
| Décharges (OSM) | `decharges_osm_42.json` | `export_osm_contexte_42.py` | `landuse=landfill` |
| Centres communaux (OSM) | `centres_communaux_osm_42.json` | `export_osm_risques_42.py` | `amenity=community_centre` |
| Écoles (OSM) | `ecoles_osm_42.json` | `export_osm_risques_42.py` | `amenity=school` |
| Toponymes (OSM) | `toponymes_osm_42.json` | `export_osm_toponymie_42.py` | Éléments nommés (`natural`, `waterway`, …) |
| Lieux-dits (OSM) | `lieux_dits_osm_42.json` | `export_osm_toponymie_42.py` | `place=locality`, `hamlet`, `isolated_dwelling` |
| Puits / mines (OSM) | `puits_mines_osm_42.json` | `export_osm_contexte_42.py` | `man_made=mineshaft` |
| Carrières (OSM) | `carrieres_osm_42.json` | `export_osm_contexte_42.py` | `landuse=quarry` |
| Antennes / relais (OSM) | `antennes_osm_42.json` | `export_osm_contexte_42.py` | `man_made=mast`, `communications_tower`, … |

---

## IGN — BDTOPO et données administratives (historique)

D'anciens calques issus de la **BDTOPO** de l'[IGN](https://www.ign.fr/) (retraités en GeoJSON sous QGIS, Lambert-93 / EPSG:2154) ont pu être utilisés en amont du projet :

| Fichier (historique) | Remarques |
|----------------------|-----------|
| `Zone_habitation.geojson` | Remplacé par `zones_habitation_osm_42.json` dans l'interface |
| `Toponyme.geojson` | Remplacé par les calques toponymie OSM |
| `Lieu_dit_non_habite.geojson` | Non branché dans `index.html` |
| `communes-42-loire.geojson` | Limites administratives ; remplacé par `communes_contours_osm_42.geojson` pour l'affichage commune |

**Licence IGN :** selon le produit sur le [Géoportail](https://geoportail.gn.fr/) ou [data.gouv.fr](https://www.data.gouv.fr/) — en général [Licence Ouverte Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence).

---

## Bibliothèques et outils

| Composant | Source | Usage |
|-----------|--------|-------|
| [Leaflet](https://leafletjs.com/) | BSD-2-Clause | Carte interactive |
| [protomaps-leaflet](https://github.com/protomaps/PMTiles) | Protomaps LLC | Affichage du fond PMTiles |
| [PMTiles](https://github.com/protomaps/PMTiles) | Protomaps LLC | Format de tuiles vectorielles monofichier |
| [go-pmtiles](https://github.com/protomaps/go-pmtiles) | Protomaps LLC | Outil CLI (`pmtiles/tools/pmtiles.exe`) |
| [proj4js](https://github.com/proj4js/proj4js) | MIT | Projections UTM |
| Python 3 | — | `serve.py`, exports Overpass (`scripts/export_osm_*.py`), MNT (`build_elevation_loire.py`), découpage (`pack_large_file.py`) |
| `serve.py` | Cartoff | Serveur statique avec support HTTP **Range** (requis pour PMTiles) |
| QGIS | — | Préparation / conversion des GeoJSON historiques (fichiers `.qmd` associés) |

---

## Inspiration et ressources

- [map.gaulix.fr](https://github.com/valentintintin) — modèle de carte hors ligne avec PMTiles (Valentin Saugnier)
- [README.md](README.md) — démarrage rapide, fichiers volumineux
- [elevation/README.md](elevation/README.md) — génération du MNT
- [pmtiles/README.md](pmtiles/README.md) — découpage / restauration du fond

---

## Attribution recommandée

Alignée sur le contrôle d'attribution Leaflet dans `index.html` :

| Donnée | Texte suggéré |
|--------|---------------|
| **OpenStreetMap** (fond PMTiles et calques GeoJSON) | « © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributeurs » — licence [ODbL](https://opendatacommons.org/licenses/odbl/) |
| **Copernicus DEM** (altitude affichée) | « MNT [Copernicus DEM](https://spacedata.copernicus.eu/) » |
| **IGN / Etalab** (si réutilisation de données BDTOPO) | Selon la licence du produit (« © IGN » ou Licence Ouverte) |
| **DFCI** | Système de coordonnées public ; pas d'attribution cartographique obligatoire, mais citer les jeux [data.gouv.fr](https://www.data.gouv.fr/datasets/carroyage-dfci-2-km) en cas de publication dérivée |
