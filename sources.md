# Sources de données — Cartoff

Ce document recense les sources utilisées dans le projet **Cartoff** (cartographie hors ligne pour la gestion de crise, département de la Loire — 42).

Dernière mise à jour : juin 2026.

---

## Fond de carte

| Élément | Source | Licence / remarques |
|---------|--------|----------------------|
| `pmtiles/loire.pmtiles` | Tuiles vectorielles au format [PMTiles](https://github.com/protomaps/PMTiles), affichées via [protomaps-leaflet](https://github.com/protomaps/PMTiles) (`flavor: light`, `lang: fr`) | Approche inspirée de [map.gaulix.fr](https://github.com/valentintintin) (Valentin Saugnier). Fichier découpé en morceaux pour GitHub — voir `pmtiles/README.md`. |
| Tuiles OSM en ligne (alternative commentée) | [OpenStreetMap](https://www.openstreetmap.org/) — `tile.openstreetmap.org` | Non utilisée par défaut ; présente en commentaire dans `index.html`. |

---

## OpenStreetMap (via Overpass API)

Les calques suffixés `*_osm_42` sont extraits du département 42 (`area["ISO3166-2"="FR-42"]`) à l'aide de l'[Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), via les scripts Python du dossier `scripts/`.

**Points d'accès utilisés :**

- https://overpass.kumi.systems/api/interpreter
- https://overpass-api.de/api/interpreter

**Licence :** [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/) — © contributeurs OpenStreetMap.

### Calques actifs dans `index.html`

| Calque | Fichier | Script d'export | Critères OSM principaux |
|--------|---------|-----------------|-------------------------|
| Contours communes (OSM) | `geojson/D42/communes_contours_osm_42.geojson` | `export_osm_communes_42.py` | `boundary=administrative`, `admin_level=8` |
| Casernes sapeurs-pompiers | `geojson/D42/casernes_osm_42.geojson` | `export_osm_casernes_42.py` | `amenity=fire_station` |
| Police nationale | `geojson/D42/police_nationale_osm_42.geojson` | `export_osm_police_nationale_42.py` | `amenity=police`, `police:FR=police` ou `operator=Police nationale` |
| Aérodromes | `geojson/D42/aerodromes_osm_42.geojson` | `export_osm_aerodromes_42.py` | `aeroway=aerodrome` |
| Héliports (hélistation) | `geojson/D42/helipads_osm_42.geojson` | `export_osm_helipads_42.py` | `aeroway=helipad` |
| Hôpitaux | `geojson/D42/hopitaux_osm_42.geojson` | `export_osm_sante_42.py` | `amenity=hospital` |
| Cliniques | `geojson/D42/cliniques_osm_42.geojson` | `export_osm_sante_42.py` | `amenity=clinic` |
| Pharmacies | `geojson/D42/pharmacies_osm_42.geojson` | `export_osm_sante_42.py` | `amenity=pharmacy` |
| Mairies | `geojson/D42/Maire42.json` | `export_osm_mairies_gendarmerie_42.py` | `amenity=townhall` |
| Gendarmerie | `geojson/D42/gendarmerie 42.json` | `export_osm_mairies_gendarmerie_42.py` | `amenity=police`, `police:FR=gendarmerie` ou `operator=Gendarmerie nationale` |
| Toponymes | `geojson/D42/toponymes_osm_42.json` | `export_osm_toponymie_42.py` | Éléments nommés (`natural`, `waterway`, `landform`, `historic`) |
| Lieux-dits | `geojson/D42/lieux_dits_osm_42.json` | `export_osm_toponymie_42.py` | `place=locality`, `hamlet`, `isolated_dwelling` |
| Zones d'habitation | `geojson/D42/zones_habitation_osm_42.json` | `export_osm_toponymie_42.py` | `landuse=residential` |

### Calques OSM exportés (présents dans le dépôt, pas encore branchés dans `index.html`)

| Calque | Fichier | Script | Critères OSM principaux |
|--------|---------|--------|-------------------------|
| Points de rassemblement | `geojson/D42/points_rassemblement_osm_42.json` | `export_osm_risques_42.py` | `emergency=assembly_point` |
| Bouches d'incendie | `geojson/D42/bouches_incendie_osm_42.json` | `export_osm_risques_42.py` | `emergency=fire_hydrant` |
| Centres communaux | `geojson/D42/centres_communaux_osm_42.json` | `export_osm_risques_42.py` | `amenity=community_centre` |
| Écoles | `geojson/D42/ecoles_osm_42.json` | `export_osm_risques_42.py` | `amenity=school` |
| Abris | `abris_osm_42.json` *(à générer)* | `export_osm_risques_42.py` | `amenity=shelter` |
| Zones industrielles | `zones_industrielles_osm_42.json` *(à générer)* | `export_osm_risques_42.py` | `landuse=industrial` |
| Sites industriels | `sites_industriels_osm_42.json` *(à générer)* | `export_osm_risques_42.py` | `man_made=works` |
| Puits / mines | `puits_mines_osm_42.json` *(à générer)* | `export_osm_contexte_42.py` | `man_made=mineshaft` |
| Carrières | `carrieres_osm_42.json` *(à générer)* | `export_osm_contexte_42.py` | `landuse=quarry` |
| Déchetteries | `decheteries_osm_42.json` *(à générer)* | `export_osm_contexte_42.py` | `amenity=waste_transfer_station` |
| Décharges | `decharges_osm_42.json` *(à générer)* | `export_osm_contexte_42.py` | `landuse=landfill` |
| Cimetières | `cimetieres_osm_42.json` *(à générer)* | `export_osm_contexte_42.py` | `landuse=cemetery` |
| Antennes | `antennes_osm_42.json` *(à générer)* | `export_osm_contexte_42.py` | `man_made=mast`, `communications_tower`, `tower:type=communication` |
| Services publics | `services_publics_osm_42.json` *(à générer)* | `export_osm_contexte_42.py` | `office=government` |

---

## IGN — BDTOPO et données administratives

Le `README.md` du projet indique que plusieurs jeux de données d'origine proviennent de la **BDTOPO** de l'[IGN](https://www.ign.fr/) (Base de Données Topographiques), retraitées en GeoJSON sous QGIS (projection Lambert-93 / EPSG:2154).

| Calque | Fichier | Remarques |
|--------|---------|-----------|
| Zones d'habitation | `geojson/D42/Zone_habitation.geojson` | Issu BDTOPO (cf. README) ; entrées dont la source est SDIS ont été retirées |
| Lieux-dits habitables (toponymes) | `geojson/D42/Toponyme.geojson` | Issu BDTOPO (cf. README) ; entrées dont la source est SDIS ont été retirées |
| Lieux-dits non habitables | `geojson/D42/Lieu_dit_non_habite.geojson` | Issu BDTOPO (cf. README) |
| Contours communaux | `geojson/D42/communes-42-loire.geojson` | Limites administratives (codes INSEE + nom de commune) ; traitement QGIS, origine administrative française (IGN / référentiel communal) |

**Licence IGN :** selon le produit téléchargé sur le [Géoportail](https://geoportail.gn.fr/) ou [data.gouv.fr](https://www.data.gouv.fr/) — en général [Licence Ouverte Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence) pour les données ouvertes de l'administration.

---

## Bibliothèques et outils

| Composant | Source | Usage |
|-----------|--------|-------|
| [Leaflet](https://leafletjs.com/) | BSD-2-Clause | Carte interactive |
| [protomaps-leaflet](https://github.com/protomaps/PMTiles) | Protomaps LLC | Affichage du fond PMTiles |
| [PMTiles](https://github.com/protomaps/PMTiles) | Protomaps LLC | Format de tuiles vectorielles monofichier |
| [go-pmtiles](https://github.com/protomaps/go-pmtiles) | Protomaps LLC | Outil CLI (dossier `pmtiles/tools/`) |
| Python 3 | — | Scripts d'export Overpass (`scripts/export_osm_*.py`) |
| QGIS | — | Préparation / conversion des GeoJSON historiques (fichiers `.qmd` associés) |

---

## Inspiration et ressources

- [map.gaulix.fr](https://github.com/valentintintin) — modèle de carte hors ligne avec PMTiles (Valentin Saugnier)
- [README.md](README.md) du projet — mention de la BDTOPO IGN et du workflow PMTiles

---

## Attribution recommandée

Lors de la diffusion ou de la réutilisation des données :

- **OpenStreetMap** : « © contributeurs OpenStreetMap » — [https://www.openstreetmap.org/copyright](https://www.openstreetmap.org/copyright)
- **IGN / Etalab** : selon la licence du produit utilisé (souvent « © IGN » ou « Licence Ouverte »)
