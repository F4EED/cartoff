# Sources de données — Cartoff

Ce document recense les sources utilisées dans le projet **Cartoff** (cartographie hors ligne pour la gestion de crise, département de la Loire — 42).

Dernière mise à jour : juillet 2026.

---

## Fond de carte

| Élément | Source | Licence / remarques |
|---------|--------|----------------------|
| `pmtiles/loire.pmtiles` | Tuiles vectorielles au format [PMTiles](https://github.com/protomaps/PMTiles), affichées via [protomaps-leaflet](https://github.com/protomaps/PMTiles) (`flavor: light`, `lang: fr`, **`levelDiff: 0`**) | Données cartographiques issues d'[OpenStreetMap](https://www.openstreetmap.org/) ; zoom **9–15** uniquement. Approche inspirée de [map.gaulix.fr](https://github.com/valentintintin) (Valentin Saugnier). Fichier découpé pour GitHub — voir `pmtiles/README.md`. |
| Tuiles OSM en ligne (alternative commentée) | [OpenStreetMap](https://www.openstreetmap.org/) — `tile.openstreetmap.org` | Non utilisée par défaut ; présente en commentaire dans `index.html`. |

**Serveur requis :** `serve.py` ou `start.bat` (HTTP Range). Voir `pmtiles/README.md` pour `levelDiff: 0` et le dépannage fond gris.

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
| `js/coords-utils.js` | Implémentation Cartoff | UTM (WGS84), DFCI (Lambert II étendu), point-dans-polygone pour la commune, interpolation bilinéaire sur la grille d'altitude, normalisation texte recherche |
| [proj4js](https://github.com/proj4js/proj4js) (`js/proj4-src.js`) | MIT | Conversion WGS84 → UTM |
| Carroyage DFCI (calques carte) | `geojson/D42/dfci_2km_42.geojson`, `dfci_20km_42.geojson`, `dfci_100km_42.geojson` | Découpe départementale via `scripts/build_dfci_loire.py` à partir des jeux nationaux [2 km](https://www.data.gouv.fr/datasets/carroyage-dfci-2-km), [20 km](https://www.data.gouv.fr/datasets/carroyage-dfci-20-km), [100 km](https://www.data.gouv.fr/datasets/carroyage-dfci-100-km) (Licence Ouverte, Lambert 93). Section « Urgence & industrie (OSM) ». |
| Contours communaux | `geojson/D42/communes_contours_osm_42.geojson` | Nom de commune affiché au survol ; index de recherche par commune |

**Algorithme DFCI** (`latLngToDfci` dans `coords-utils.js`) :

1. WGS84 → NTF (ellipsoïde Clarke 1880, méridien de Paris) ;
2. NTF → Lambert II étendu (constantes `L2E`) ;
3. Découpage en carreaux 100 km / 20 km / 2 km selon la numérotation DFCI (6 caractères de base ; sous-division `.1`–`.5` calculée mais non affichée dans l'interface).

**Remarque :** le DFCI historique repose sur Lambert II étendu ; depuis 2009 des référentiels officiels existent aussi en Lambert 93. L'implémentation suit la grille Lambert II étendu pour compatibilité avec les usages pompiers / feux de forêt.

**Régénération des calques DFCI :**

```bash
pip install geopandas py7zr shapely
python scripts/build_dfci_loire.py
```

Emprise de découpe : 45,0°–46,5° N, 3,5°–5,0° E (bbox Loire). Archives nationales mises en cache sous `scripts/.cache/dfci/`.

**Affichage et performance :**

- Les trois calques DFCI sont en **chargement lazy** (cochés à la demande).
- Le calque **2 km** (~5 012 mailles, ~1,6 Mo) est le plus lourd : rendu **canvas**, `smoothFactor: 2.5`, visible à partir du zoom 11, mention ⚠ lourd dans l'UI.
- Calques 20 km et 100 km : contours plus légers, même lazy load.

**Recherche DFCI** (section Recherche de `index.html`) :

- Champ texte actif lorsqu'au moins un calque DFCI est coché.
- Index construit à la volée depuis les GeoJSON (`props.dfci` / `props.label`).
- Codes partiels acceptés (`HF`, `HF26`, `HF26H4`…) ; résolution préférée selon la longueur du code (100 km → 20 km → 2 km).
- Zoom sur la maille + surbrillance violette ; active automatiquement le calque correspondant si besoin.

---

## Recherche (interface)

| Cible | Calque source requis | Fichier / index |
|-------|----------------------|-----------------|
| Commune | Contours communes (OSM) | `communes_contours_osm_42.geojson` — index au chargement du calque |
| Zone industrielle | Zones industrielles (OSM) | `zones_industrielles_osm_42.json` |
| Site industriel | Sites industriels (OSM) | `sites_industriels_osm_42.json` |
| Zone d'habitation | Zones d'habitation (OSM) | `zones_habitation_osm_42.json` |
| Code DFCI | Au moins un calque DFCI actif | Index `dfciSearchIndex` (2 / 20 / 100 km) |
| Constat | Constats / événements (coché) | Features en mémoire (`situationFeatures`) |

Les listes déroulantes sont alimentées après chargement lazy du calque concerné. La recherche DFCI utilise un champ texte + bouton « Aller ».

---

## OpenStreetMap (via Overpass API)

Les calques suffixés `*_osm_42` sont extraits du département 42 (`area["ISO3166-2"="FR-42"]`) à l'aide de l'[Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), via les scripts Python du dossier `scripts/`.

**Points d'accès utilisés :**

- https://overpass.kumi.systems/api/interpreter
- https://overpass-api.de/api/interpreter

**Licence :** [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/) — © contributeurs OpenStreetMap.

### Calques branchés dans `index.html`

Tous les calques ci-dessous sont listés dans `geojsonFiles` (`index.html`). **Tous sont en lazy load** (sauf le fond PMTiles, toujours actif).

| Calque (UI) | Fichier | Script d'export | Critères OSM principaux |
|-------------|---------|-----------------|-------------------------|
| Contours communes (OSM) | `communes_contours_osm_42.geojson` | `export_osm_communes_42.py` | `boundary=administrative`, `admin_level=8` |
| Zones industrielles (OSM) | `zones_industrielles_osm_42.json` | `export_osm_risques_42.py` | `landuse=industrial` |
| Sites industriels (OSM) | `sites_industriels_osm_42.json` | `export_osm_risques_42.py` | `man_made=works` |
| Zones d'habitation (OSM) | `zones_habitation_osm_42.json` | `export_osm_toponymie_42.py` | `landuse=residential` |
| Aérodromes (OSM) | `aerodromes_osm_42.geojson` | `export_osm_aerodromes_42.py` | `aeroway=aerodrome` |
| Héliports (OSM) | `helipads_osm_42.geojson` | `export_osm_helipads_42.py` | `aeroway=helipad` |
| Carroyage DFCI 100 km (42) | `dfci_100km_42.geojson` | `build_dfci_loire.py` | [Carroyage DFCI 100 km](https://www.data.gouv.fr/datasets/carroyage-dfci-100-km) (Licence Ouverte) |
| Carroyage DFCI 20 km (42) | `dfci_20km_42.geojson` | `build_dfci_loire.py` | [Carroyage DFCI 20 km](https://www.data.gouv.fr/datasets/carroyage-dfci-20-km) (Licence Ouverte) |
| Carroyage DFCI 2 km (42) | `dfci_2km_42.geojson` | `build_dfci_loire.py` | [Carroyage DFCI 2 km](https://www.data.gouv.fr/datasets/carroyage-dfci-2-km) (Licence Ouverte) |
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

### Optimisations d'affichage (calques OSM)

Pour les polygones denses (communes, zones industrielles / habitation, sites, DFCI), `index.html` utilise :

- un rendu **canvas** partagé (`L.canvas`) ;
- un `smoothFactor` adapté (jusqu'à 2,5 sur DFCI 2 km) ;
- le chargement **uniquement à l'activation** de la case à cocher (`addLazyCheckbox`).

---

## Constats / événements de situation

| Élément | Source | Licence / remarques |
|---------|--------|----------------------|
| `geojson/situation_constats.geojson` | Fichier source **vide** par défaut (`features: []`) | Non issues d'OSM ; saisie via l'interface (`created_by`, `statut`, `gravite`, `sous_type`, etc.) |
| `js/poi-types.js` | Registre Cartoff (`window.CartoffPoi`) | Types → géométries autorisées, panneaux (`images/*.png`, `*.svg`), styles ligne / polygone |
| Panneaux | Signaux routiers / pictogrammes locaux (`images/KC1_*.png`, `images/KD22*.png`, `images/panneau_vierge_à_compléter.png`, …) | Usage interne POC ; calque autonome, pas mélangé aux données OSM |

### Géométries (phase 2–3)

| Mode | Géométrie GeoJSON | Saisie |
|------|-------------------|--------|
| Point (panneau) | `Point` | Clic droit → « Point (panneau) » |
| Tronçon | `LineString` | Clic droit → « Tronçon (ligne) » — clics, double-clic ou **Terminer** (min. 2 sommets) |
| Zone | `Polygon` | Clic droit → « Zone (surface) » — contour, **Terminer** ferme le polygone (min. 3 sommets) |

Pendant le dessin : bannière **Terminer** / **Annuler**, touche **Échap** pour annuler. Clic droit sur un constat existant : modifier, marquer inactif, réactiver, supprimer.

### Types avec polygone (`js/poi-types.js`)

Types acceptant une **zone** (propriété `geometry` incluant `'polygon'`) :

| `sous_type` | Libellé | Remarque |
|-------------|---------|----------|
| `coulee_debris` | Coulée de boue/débris | point ou zone |
| `route_inondee` | Route inondée | point, tronçon ou zone |
| `zone_inondee` | Zone inondée | **zone uniquement** (défaut à la création) |
| `incendie` | Incendie | point ou zone |
| `grele` | Grêle | point ou zone |
| `fumee` | Fumée | point ou zone |
| `incident_generique` | Incident générique | point ou zone |
| `perimetre` | Périmètre | **zone uniquement** |

Les tronçons (`'line'`) couvrent notamment : travaux, route barrée, déviation, circulation alternée, obstacle, chaussée rétrécie, accès interdit, sens interdit, route inondée.

### Persistance et export

- **localStorage** : clé `cartoff_situation_constats` (features) ; métadonnées optionnelles `cartoff_situation_meta`.
- Au premier chargement sans stockage local : lecture de `geojson/situation_constats.geojson`.
- **Export** : bouton « Exporter GeoJSON » → téléchargement `situation_constats.geojson`.
- **Lazy load** : le calque « Constats / événements » n'est chargé qu'une fois coché (`ensureSituationLayerReady`).
- Réinitialiser après essais : `localStorage.removeItem('cartoff_situation_constats')` dans la console navigateur.

Filtre « Afficher les inactifs » : masque les constats au statut inactif par défaut.

---

## Missions SAR

**Guide opérationnel (procédures terrain) :** [SAR.md](SAR.md)

| Élément | Source | Licence / remarques |
|---------|--------|----------------------|
| `js/sar-types.js` | Registre Cartoff (`window.CartoffSarTypes`) | Rôles géométriques, types de mission, propriétés `sar:*`, géodésie (`destinationPoint`, `computeAllIntersections`) |
| `js/sar-missions.js` | Module Cartoff (`window.CartoffSar`) | Missions, saisie, aperçu relèvement, rendu multi-fixes, checklist visibilité, persistance, export |
| Panneau `sarPane` (z-index 620) | `index.html` | Calque au-dessus des constats (`situationPane` 610) |

### Types de mission

| `type` | Disponible | Remarque |
|--------|------------|----------|
| `personne` | Oui (SAR-1) | LKP, indices, waypoints, tracés |
| `aeronef` | Oui (SAR-2) | Station DF, relèvements réception / réciproque |

### Rôles (`sar:role`)

| Rôle | Géométrie | Mission | Symbole |
|------|-----------|---------|---------|
| `lkp` | Point | personne | Losange orange |
| `indice` | Point | personne | Cercle jaune |
| `waypoint` | Point | personne | Triangle bleu |
| `trace_fouille` | Polygon | personne | Zone verte remplie |
| `axe_probable` | LineString | personne | Ligne violette pointillée |
| `station_df` | Point | aéronef | Triangle orange ▲ (marqueur DF) |
| `relevement_df` | LineString | aéronef | Ligne orange pleine (réception) ou pointillée (réciproque) |
| `fixe_estime` | Point | aéronef | Croix colorée par candidat (intersection SAR-3, ★ = meilleur) |
| `incertitude_fix` | Polygon | aéronef | Cercle semi-transparent (couleur du candidat) |

### Propriétés GeoJSON (`sar:*`)

| Propriété | Usage |
|-----------|--------|
| `sar:mission_id`, `sar:role`, `sar:mission_type` | Tous les éléments |
| `sar:azimuth` | Azimut du relèvement (°) |
| `sar:range_km` | Portée affichée (km) |
| `sar:bearing_reciprocal` | `false` = ligne réception, `true` = ligne réciproque (+180°) |
| `sar:station_id` | ID de la feature `station_df` parente |
| `sar:bearing_group_id` | Lie la paire réception / réciproque (même UUID) |
| `sar:quality_angle` | Angle de coupe au fixe (°) — SAR-3 |
| `sar:uncertainty_km` | Rayon d’incertitude du fixe (km) — SAR-3 |
| `sar:fix_station_ids` | IDs des stations utilisées pour le fixe (virgules) — SAR-3 |
| `sar:fix_index` | Numéro du candidat (1, 2, …) — SAR-3 multi-fixes |
| `sar:fix_is_best` | `true` pour le meilleur candidat (angle ~90°) — SAR-3 |
| `sar:fix_color` | Couleur hex du candidat sur la carte — SAR-3 |

Géométrie des relèvements et intersections : calcul sphérique offline (`destinationPoint`, `intersectBearings`, `computeAllIntersections` dans `sar-types.js`).

Champ mission : `visibleFixIds[]` — IDs des fixes affichés sur la carte (persistance `cartoff_sar_missions`).

### Saisie

- **Mode SAR** (mission active) : menu contextuel carte + boutons barre latérale
- **Personne** : points immédiats ; polylignes / polygones avec **Terminer** / **Annuler** / **Échap**
- **Aéronef** : **Station DF** (point + panneau, horodatage modifiable) ; **Relèvement** (azimut + portée → 2 lignes auto, **aperçu carte** pendant la saisie) ; **Intersection SAR-3** (multi-candidats, checklist visibilité, rapport)
- Mission **clôturée** : consultation seule (opacité réduite, pas de nouvelle saisie)

### Persistance et export

- **localStorage** : clé `cartoff_sar_missions` (tableau `missions`, chaque mission avec `features[]` et `visibleFixIds[]` pour les fixes affichés)
- **Export** : « Exporter mission » ou « Exporter tout » → GeoJSON (inclut fixe SAR-3 si calculé)
- **Rapport SAR-3** : « Exporter rapport SAR » (.txt) ou copie presse-papiers
- Réinitialiser : `localStorage.removeItem('cartoff_sar_missions')`

### Limitations SAR-3

- Intersection **par paires** de relèvements réception (stations distinctes) ; toutes les paires valides deviennent des candidats numérotés et colorés (meilleur = angle de coupe le plus proche de 90°)
- Rejets : azimuts parallèles, angle de coupe &lt; 15°, fixe incohérent avec les azimuts (~45°), même station sur les deux relèvements
- Pas de fusion statistique ni triangulation multi-points au-delà des paires
- Cercle d’incertitude **indicatif** (rayon saisi, défaut 2 km — pas dérivé de la GDOP ni de la précision instrumentale)
- Outil **non certifié** DF ; voir avertissements dans [SAR.md](SAR.md) et le rapport exporté
- Calculs de probabilité, zones de recherche probabilistes, corrélations multi-missions : hors périmètre POC
- Import / synchronisation cloud des missions SAR : non implémenté (export GeoJSON / rapport .txt manuel)

---

## Import de fichiers locaux (GeoJSON, KML, KMZ)

| Élément | Source | Licence / remarques |
|---------|--------|----------------------|
| `js/file-import.js` | Module Cartoff | Parsing 100 % hors ligne via `FileReader` ; aucun appel réseau |
| [JSZip](https://stuk.github.io/jszip/) (`js/jszip.min.js`) | MIT / GPL-3.0 | Décompression KMZ (archive ZIP contenant un KML) |
| [@mapbox/togeojson](https://github.com/mapbox/togeojson) (`js/togeojson.js`) | BSD-2-Clause | Conversion KML → GeoJSON côté navigateur |

### Formats acceptés

| Extension | Contenu attendu |
|-----------|-----------------|
| `.geojson`, `.json` | GeoJSON (`FeatureCollection`, `Feature` ou géométrie seule) |
| `.kml` | Keyhole Markup Language (placemarks, lignes, polygones) |
| `.kmz` | Archive ZIP contenant au moins un fichier `.kml` |

Géométries prises en charge : `Point`, `LineString`, `Polygon` et variantes `Multi*`. Pas de prise en charge des modèles 3D, extrusions KML ou réseaux temporels.

### Interface

Section **Importer données externes (kml,kmz, geojson)** (`index.html`) :

- Bouton « Choisir un fichier… » (`input type=file`, `multiple`)
- Liste des calques importés : visibilité (case), pastille couleur, suppression (×)
- Option « Zoomer sur le calque à l'import » (`fitBounds`)
- Messages d'erreur en français si fichier invalide ou vide

Les calques apparaissent sur la carte avec une couleur cyclique (palette dédiée) et dans la légende sous le préfixe `[Import] nom_fichier`.

### Persistance

| Clé | Stockage | Comportement |
|-----|----------|--------------|
| `cartoff_imported_layers` | **`sessionStorage`** | Conserve métadonnées + GeoJSON pour la session du navigateur |

- **Rechargement de page** (F5) : les imports sont restaurés si le total reste sous ~4 Mo.
- **Fermeture de l'onglet / du navigateur** : les imports sont perdus (choix volontaire pour éviter de saturer `localStorage` et de mélanger données terrain éphémères et calques OSM).
- Les constats terrain restent dans `localStorage` (`cartoff_situation_constats`) — mécanisme distinct.

Pour effacer manuellement : `sessionStorage.removeItem('cartoff_imported_layers')` dans la console.

### Limitations connues

- Taille totale session ~4 Mo (limite pratique `sessionStorage`) ; au-delà, les imports restent visibles mais ne sont plus sauvegardés au rechargement.
- Fichiers très denses (milliers de polygones) : rendu canvas automatique au-delà d'un seuil, mais performances variables selon la machine.
- KML avec styles complexes, réseaux (`NetworkLink`) ou coordonnées non WGS84 peuvent être ignorés ou mal positionnés.
- Pas d'export des calques importés depuis l'interface (utiliser l'outil source ou ré-importer).

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
| [protomaps-leaflet](https://github.com/protomaps/PMTiles) | Protomaps LLC | Affichage du fond PMTiles (`levelDiff: 0`) |
| [PMTiles](https://github.com/protomaps/PMTiles) | Protomaps LLC | Format de tuiles vectorielles monofichier |
| [go-pmtiles](https://github.com/protomaps/go-pmtiles) | Protomaps LLC | Outil CLI (`pmtiles/tools/pmtiles.exe`) |
| [proj4js](https://github.com/proj4js/proj4js) | MIT | Projections UTM |
| [JSZip](https://stuk.github.io/jszip/) | MIT / GPL-3.0 | Décompression KMZ (`js/jszip.min.js`) |
| [@mapbox/togeojson](https://github.com/mapbox/togeojson) | BSD-2-Clause | KML → GeoJSON (`js/togeojson.js`) |
| Python 3 | — | `serve.py`, exports Overpass (`scripts/export_osm_*.py`), MNT (`build_elevation_loire.py`), DFCI (`build_dfci_loire.py`), découpage (`pack_large_file.py`) |
| `serve.py` | Cartoff | Serveur statique avec HTTP **Range** (206) — requis pour PMTiles |
| `start.bat` | Cartoff | Windows : libère le port 8000, vérifie `loire.pmtiles`, lance `serve.py` |
| QGIS | — | Préparation / conversion des GeoJSON historiques (fichiers `.qmd` associés) |

---

## Inspiration et ressources

- [map.gaulix.fr](https://github.com/valentintintin) — modèle de carte hors ligne avec PMTiles (Valentin Saugnier)
- [README.md](README.md) — démarrage rapide, fonctionnalités
- [SAR.md](SAR.md) — guide opérationnel Missions SAR (personne, DF, SAR-3, dépannage)
- [elevation/README.md](elevation/README.md) — génération du MNT
- [pmtiles/README.md](pmtiles/README.md) — découpage / restauration du fond, `levelDiff`, dépannage

---

## Attribution recommandée

Alignée sur le contrôle d'attribution Leaflet dans `index.html` :

| Donnée | Texte suggéré |
|--------|---------------|
| **OpenStreetMap** (fond PMTiles et calques GeoJSON) | « © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributeurs » — licence [ODbL](https://opendatacommons.org/licenses/odbl/) |
| **Copernicus DEM** (altitude affichée) | « MNT [Copernicus DEM](https://spacedata.copernicus.eu/) » |
| **IGN / Etalab** (si réutilisation de données BDTOPO) | Selon la licence du produit (« © IGN » ou Licence Ouverte) |
| **DFCI** | Système de coordonnées public ; pas d'attribution cartographique obligatoire, mais citer les jeux [data.gouv.fr](https://www.data.gouv.fr/datasets/carroyage-dfci-2-km) en cas de publication dérivée |
