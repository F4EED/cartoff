# Missions SAR — guide opérationnel (Cartoff)

Guide en français pour les opérateurs terrain : recherche de personne et localisation d’aéronef par direction-finding (DF), **100 % hors ligne**.

> **Documentation technique complémentaire :** [sources.md](sources.md) (propriétés GeoJSON, modules JS) · [README.md](README.md) (vue d’ensemble Cartoff)

---

## 1. À quoi sert le module SAR ?

Le module **Missions SAR** (*Search and Rescue*) permet de structurer une opération de recherche sur la carte Cartoff, **sans connexion réseau** :

| Besoin | Type de mission | Exemples |
|--------|-----------------|----------|
| **Personne disparue** | `personne` (SAR-1) | LKP, indices trouvés, axe de déplacement probable, zones déjà fouillées |
| **Aéronef / balise** | `aéronef` (SAR-2 / SAR-3) | Stations DF, relèvements d’azimut, intersection géodésique, fixe estimé |

Les éléments sont saisis sur la carte (clic droit, boutons de la barre latérale), horodatés, enrichis automatiquement (commune, DFCI, UTM dans les popups et rapports), puis **sauvegardés localement** dans le navigateur.

**Ce que Cartoff n’est pas :** un outil certifié de triangulation DF, un système de gestion d’incident officiel, ni un substitut à l’analyse d’un coordinateur SAR qualifié. Les fixe(s) estimé(s) sont **indicatifs** ; validez toujours sur le terrain et avec vos procédures.

---

## 2. Accès et prérequis

1. Lancer Cartoff via **`start.bat`** ou **`python serve.py`**, puis ouvrir **http://localhost:8000/** (le fond de carte et les calques ne fonctionnent pas en `file://`).
2. Dans la barre latérale, ouvrir la section **Missions SAR**.
3. Cocher **Afficher sur la carte** pour voir les symboles SAR (calque dédié `sarPane`, au-dessus des constats).

Sans mission active, seuls la création et l’export global sont disponibles.

---

## 3. Types de mission

| Type | Code | Statut | Rôles disponibles |
|------|------|--------|-------------------|
| **Personne** | `personne` | SAR-1 | LKP, Indice, Waypoint, Axe probable, Fouilles (zone) |
| **Aéronef** | `aeronef` | SAR-2 + SAR-3 | Station DF, Relèvement DF, Fixe estimé, Incertitude |

Une mission a un **nom**, un **statut** (`active` ou `closed`) et une date de création. Une seule mission est **active** à la fois (sélecteur « Mission active »).

---

## 4. Workflow commun (toutes missions)

### 4.1 Créer une mission

1. Saisir un **nom** (ex. « Disparition RD512 — 03/07 »).
2. Choisir le **type** : Personne ou Aéronef.
3. Cliquer **Créer mission**.

La mission devient active ; le **Mode SAR** et l’**affichage carte** s’activent automatiquement.

### 4.2 Mode SAR et affichage

| Option | Rôle |
|--------|------|
| **Mode SAR** | Autorise la saisie (points, tracés, stations, relèvements). Désactivé si mission clôturée. |
| **Afficher sur la carte** | Affiche ou masque le calque SAR sans supprimer les données. |

Pendant un dessin (polyligne, polygone, placement de point) : bannière **Terminer** / **Annuler**, touche **Échap** pour annuler.

### 4.3 Modifier ou supprimer un élément

- **Clic droit** sur un symbole ou une ligne → menu **Mission SAR** : modifier, supprimer, ou actions spécifiques (relèvement depuis une station, etc.).
- Panneau flottant : libellé, notes, champs selon le rôle (azimut, portée, horodatage station…).

### 4.4 Clôturer, réactiver, supprimer

- **Clôturer** : consultation seule (symboles atténués, pas de nouvelle saisie).
- **Réactiver** : repasse en édition.
- **Supprimer** : efface la mission et **tous** ses éléments (irréversible).

### 4.5 Export

| Bouton | Fichier | Contenu |
|--------|---------|---------|
| **Exporter mission** | `sar_mission_<nom>.geojson` | Features de la mission active |
| **Exporter tout** | `sar_missions.geojson` | Toutes les missions |
| **Exporter rapport SAR** | `sar_rapport_<nom>.txt` | Rapport texte (mission aéronef avec fixe calculé) |
| **Copier rapport** | Presse-papiers | Même contenu que le rapport .txt |

---

## 5. Mission personne (SAR-1) — procédure pas à pas

Objectif : matérialiser sur la carte l’état de la recherche terrestre.

### 5.1 Préparer la mission

1. Créer une mission type **Personne**.
2. Activer **Mode SAR** et **Afficher sur la carte**.
3. (Recommandé) Activer le carroyage **DFCI** et/ou les contours communaux pour lire les codes au survol.

### 5.2 LKP — dernière position connue

1. Bouton **LKP** ou clic droit sur la carte → **LKP (dernière position connue)**.
2. Cliquer l’emplacement sur la carte.
3. Dans le panneau : libellé (ex. « Parking col de la Loge »), notes (témoin, heure…).
4. **Enregistrer**.

Symbole : losange orange **L**.

### 5.3 Indices

Pour chaque objet, trace ou témoignage géolocalisable :

1. Bouton **Indice** ou menu contextuel → **Indice**.
2. Placer le point, renseigner libellé et notes (ex. « Sac bleu vu 14h30 »).
3. **Enregistrer**.

Symbole : cercle jaune **I**.

### 5.4 Waypoints

Points de passage ou repères opérationnels (PC secondaire, héliport, accès) :

1. Bouton **WP** → clic sur la carte → panneau → **Enregistrer**.

Symbole : triangle bleu **W**.

### 5.5 Axe probable

Ligne représentant une direction de déplacement supposée (pente, vallée, itinéraire habituel) :

1. Bouton **Axe** ou menu contextuel → **Axe probable (polyligne)**.
2. Cliquer les sommets sur la carte (minimum **2 points**).
3. **Terminer** (bouton bannière, ou double-clic sur le dernier segment pour les lignes).
4. Valider libellé / notes dans le panneau → **Enregistrer**.

Style : ligne violette pointillée.

### 5.6 Fouilles — zone fouillée (polygone)

Pour marquer une zone déjà parcourue ou assignée à une équipe :

1. Bouton **Fouilles** ou menu contextuel → **Fouilles (zone fouillée)**.
2. Cliquer le contour (minimum **3 points**).
3. **Terminer** (ferme automatiquement le polygone).
4. Panneau → **Enregistrer**.

Style : zone verte semi-transparente.

### 5.7 Bonnes pratiques mission personne

- Poser le **LKP en premier**, puis les indices au fur et à mesure.
- Utiliser les **notes** pour l’heure, la source, le niveau de confiance.
- **Exporter la mission** en GeoJSON en fin de vacation ou avant clôture.
- Les missions SAR sont **indépendantes** des constats « situation » (inondation, routes…) : utilisez les deux calques si besoin.

---

## 6. Mission aéronef (SAR-2) — stations DF et relèvements

Objectif : enregistrer les positions des stations de direction-finding et les azimuts reçus vers une balise ou un transpondeur.

### 6.1 Préparer la mission

1. Créer une mission type **Aéronef**.
2. Activer **Mode SAR** et **Afficher sur la carte**.

### 6.2 Placer une station DF

1. Bouton **Station DF**, ou clic droit sur la carte → **Station DF**.
2. Cliquer la position de la station (véhicule, site, relais).
3. Panneau :
   - **Libellé** (ex. « DF Saint-Étienne »),
   - **Notes** (fréquence, matériel, opérateur),
   - **Horodatage** (modifiable ; par défaut : maintenant).
4. **Enregistrer**.

Symbole : triangle orange **▲**.

### 6.3 Saisir un relèvement

Un relèvement crée **deux lignes** automatiquement :

| Ligne | Signification | Style carte |
|-------|---------------|-------------|
| **Réception** | Azimut mesuré depuis la station vers la source | Orange, trait plein |
| **Réciproque** | Azimut + 180° (direction opposée) | Orange, pointillé |

**Procédure :**

1. Au moins une station DF doit exister.
2. Bouton **Relèvement**, ou clic droit sur une station → **Relèvement depuis cette station** (si plusieurs stations : **Relèvement — choisir une station** puis clic sur le marqueur ▲).
3. Dans le panneau :
   - **Azimut** : 0–360°, une décimale (ex. `127.5`),
   - **Portée** : longueur affichée en km (défaut **30 km**),
   - Libellé et notes optionnels.
4. **Aperçu en direct** : tant que le panneau est ouvert, les lignes réception et réciproque s’affichent en semi-transparent sur la carte ; elles se mettent à jour quand vous modifiez azimut ou portée.
5. **Enregistrer**.

### 6.4 Modifier ou supprimer

- Clic droit sur une ligne de relèvement → **Modifier** ou **Supprimer** (supprime la paire réception + réciproque).
- Supprimer une **station** supprime aussi **tous ses relèvements** et **efface les fixe(s) estimé(s)** liés.

### 6.5 Recalcul automatique

Dès qu’au moins **2 relèvements réception** depuis des **stations distinctes** existent, Cartoff peut recalculer l’intersection (voir SAR-3). Toute modification de relèvement ou de station déclenche un recalcul si des fixe(s) étaient déjà présents.

---

## 7. Intersection DF (SAR-3) — multi-fixes

Quand plusieurs stations ont chacune un azimut, Cartoff calcule les intersections géodésiques **par paires** de relèvements (stations différentes).

### 7.1 Conditions pour obtenir un fixe

Une paire de relèvements produit un candidat **uniquement si** :

- les deux stations sont **distinctes** ;
- les azimuts ne sont pas **parallèles** (pas d’intersection unique) ;
- le point d’intersection est **cohérent** avec les azimuts saisis (tolérance ~45°) ;
- l’**angle de coupe** au fixe est **≥ 15°** (intersections trop « aiguës » rejetées).

Avec **3 stations** et 3 azimuts, jusqu’à **3 paires** valides → jusqu’à **3 candidats** (souvent moins si certaines paires échouent).

### 7.2 Calculer ou recalculer

1. Section **Intersection DF (SAR-3)** dans la barre latérale.
2. Vérifier le nombre de relèvements réception affiché.
3. Ajuster **Incertitude (km)** si besoin (défaut **2 km** — cercle indicatif autour de chaque fixe).
4. Cliquer **Calculer intersection** (ou laisser le recalcul auto après saisie).

Résultat sur la carte :

| Élément | Description |
|---------|-------------|
| **Fixe estimé** | Marqueur numéroté (**1**, **2**…) ; **★** = meilleur candidat (angle de coupe le plus proche de 90°) |
| **Couleur** | Palette distincte par candidat (rouge, bleu, vert, violet…) |
| **Incertitude** | Cercle semi-transparent de même couleur |
| **Liaisons** | Traits pointillés station → fixe pour les fixes visibles |

### 7.3 Qualité de l’intersection

L’**angle de coupe** est l’angle entre les deux directions station → fixe. Plus il est proche de **90°**, meilleure est la géométrie.

| Angle (écart à 90°) | Libellé affiché |
|---------------------|-----------------|
| ≤ 15° | Excellente |
| ≤ 30° | Bonne |
| ≤ 45° | Moyenne |
| > 45° | Faible |

Le candidat **meilleur** (★) est celui dont l’angle est le plus proche de 90° parmi toutes les paires valides.

### 7.4 Liste « Fixes sur la carte » (visibilité)

Quand au moins un fixe existe et que le **Mode SAR** ou l’**affichage carte** est actif :

- Chaque candidat apparaît avec une **case à cocher**, pastille **couleur**, numéro, paires station/azimut et qualité.
- **Tout afficher** / **Tout masquer** (si plusieurs candidats).
- Décocher un fixe masque le marqueur, son cercle d’incertitude et ses lignes de liaison (les données restent enregistrées).

Le bloc **Meilleur fixe — coordonnées** affiche Lat/Lon, UTM, DFCI et l’incertitude du candidat ★.

### 7.5 Effacer les fixe(s)

- Bouton **Effacer fixe(s)** dans le panneau SAR-3, ou clic droit sur un marqueur de fixe → **Effacer tous les fixe(s) estimé(s)**.
- Les relèvements et stations **ne sont pas** supprimés ; vous pouvez recalculer après correction.

### 7.6 Exporter le rapport SAR

Une fois au moins un fixe calculé :

- **Exporter rapport SAR** → fichier `.txt` (mission, relèvements, tous les candidats, avertissement).
- **Copier rapport** → presse-papiers (même contenu).

Le rapport inclut le **meilleur fixe** en détail et liste les autres candidats avec couleur, coordonnées, angle et stations utilisées.

---

## 8. Import de données externes (complément SAR)

La section **Importer données externes (kml, kmz, geojson)** permet de superposer vos propres fichiers **sans réseau** :

- Formats : `.geojson`, `.json`, `.kml`, `.kmz`
- Chaque import = calque avec visibilité, couleur et suppression indépendants
- Option **Zoomer sur le calque à l'import**
- Persistance **`sessionStorage`** (`cartoff_imported_layers`) : conservé au rechargement de page, **perdu à la fermeture de l’onglet**

**Usage avec le SAR :** importer une trace GPS, un plan de vol ou un périmètre KML pour comparer visuellement avec LKP, axes ou fixe(s) DF. Les imports ne sont **pas** fusionnés automatiquement dans les missions SAR.

---

## 9. Persistance et formats

### 9.1 Clé localStorage

| Clé | Contenu |
|-----|---------|
| `cartoff_sar_missions` | Objet JSON : `{ version, activeMissionId, missions[] }` |

Structure d’une **mission** :

```json
{
  "id": "uuid",
  "name": "Nom de la mission",
  "type": "personne | aeronef",
  "status": "active | closed",
  "created_at": "ISO-8601",
  "features": [ "… GeoJSON Features …" ],
  "visibleFixIds": [ "id-fix-1", "id-fix-2" ]
}
```

`visibleFixIds` : liste des identifiants de fixe(s) `fixe_estime` affichés sur la carte (mission aéronef uniquement).

### 9.2 Propriétés GeoJSON (`sar:*`)

Chaque feature porte notamment :

| Propriété | Usage |
|-----------|--------|
| `sar:mission_id` | ID de la mission parente |
| `sar:role` | Rôle (`lkp`, `station_df`, `fixe_estime`, …) |
| `sar:mission_type` | `personne` ou `aeronef` |
| `sar:azimuth`, `sar:range_km` | Relèvement DF |
| `sar:bearing_reciprocal` | `false` = réception, `true` = réciproque |
| `sar:station_id`, `sar:bearing_group_id` | Liens station / paire de lignes |
| `sar:quality_angle`, `sar:uncertainty_km` | SAR-3 |
| `sar:fix_station_ids`, `sar:fix_index`, `sar:fix_is_best`, `sar:fix_color` | Candidats multiples |

Champs communs : `label`, `notes`, `created_at`, `commune`, `dfci` (si calculables).

### 9.3 Réinitialiser les données SAR

Console du navigateur (F12) :

```javascript
localStorage.removeItem('cartoff_sar_missions');
location.reload();
```

### 9.4 Valeurs par défaut

| Paramètre | Défaut |
|-----------|--------|
| Portée relèvement | 30 km |
| Incertitude fixe | 2 km |
| Couleurs candidats | Palette de 8 couleurs (cyclique) |

---

## 10. Limitations et avertissements

- **Non certifié** : Cartoff n’est pas un logiciel de navigation aérienne ni un outil DF homologué. Les intersections sont des **estimations géométriques** sur la sphère (WGS84), sans modèle d’erreur instrumentale.
- **Pas de filtrage statistique** : toutes les paires valides sont proposées ; l’opérateur choisit quoi afficher via la checklist.
- **Cercle d’incertitude** : rayon **saisi manuellement**, pas dérivé de la précision des capteurs (pas de GDOP).
- **Une seule ligne réception par station** compte pour l’intersection (la plus récente par groupe `bearing_group_id`).
- **Pas de synchronisation** cloud ni import automatique de missions SAR externes (export GeoJSON manuel uniquement).
- **Stockage navigateur** : effacer les données du site ou changer de poste **perd** les missions non exportées.
- **Emprise carte** : optimisée pour la Loire (42) ; utilisable ailleurs si le fond et les calques couvrent la zone.

**Rappel rapport exporté :** *« Estimation indicative basée sur l'intersection géodésique de relèvements DF. Ne remplace pas une analyse opérationnelle ni des données officielles. Outil 100 % offline — vérifier sur le terrain. »*

---

## 11. Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| **Un seul candidat** avec 3 stations | Seule une paire respecte angle ≥ 15° et cohérence azimut | Vérifier les azimuts saisis ; écarter stations trop alignées ; corriger une erreur de 180° |
| **Aucune intersection** | Azimuts parallèles, angle < 15°, ou fixe « derrière » une station | Modifier les relèvements ; espacer géographiquement les stations ; viser au moins 2 stations **distinctes** |
| Bouton **Calculer intersection** grisé | Moins de 2 relèvements **réception** | Ajouter des relèvements depuis au moins 2 stations différentes |
| **Checklist fixes** invisible | Mode SAR et affichage carte tous deux désactivés | Cocher l’un des deux |
| Relèvement : « Cliquez sur une station DF » | Clic loin de tout marqueur ▲ | Zoomez ; recliquez sur le triangle ou utilisez le menu contextuel sur la station |
| **Aperçu** relèvement absent | Panneau relèvement fermé | Rouvrir l’ajout/modification de relèvement ; saisir azimut et portée valides |
| Symboles SAR invisibles | Calque non affiché ou mission clôturée sans affichage | Cocher **Afficher sur la carte** ; vérifier la mission active |
| Données perdues | Cache navigateur effacé | Exporter régulièrement en GeoJSON / rapport .txt |
| Mission en lecture seule | Statut **Clôturée** | **Réactiver** pour modifier |

### Cas typique : 3 stations pour trianguler

1. Placer **Station A**, **Station B**, **Station C** aux positions réelles des véhicules DF.
2. Saisir un relèvement depuis chaque station (vérifier l’aperçu avant enregistrement).
3. **Calculer intersection** → jusqu’à 3 candidats (A+B, A+C, B+C).
4. Comparer les angles de coupe ; afficher le candidat ★ et ceux qui restent plausibles opérationnellement.
5. **Exporter rapport SAR** pour transmission au PC de coordination.

Si les trois azimuts se croisent théoriquement en un seul point mais qu’un seul candidat apparaît, deux paires ont probablement été **rejetées** (géométrie faible ou incohérence) : contrôlez chaque azimut et l’identité des stations.

---

## 12. Références code

| Fichier | Rôle |
|---------|------|
| `js/sar-types.js` | Rôles, types de mission, géodésie (`intersectBearings`, `computeAllIntersections`) |
| `js/sar-missions.js` | UI, persistance, rendu carte, export |
| `scripts/test_sar_missions.py` | Tests structure hors navigateur |

Tests locaux :

```bash
python scripts/test_sar_missions.py
```

---

*Dernière mise à jour : juillet 2026 — Cartoff POC gestion de crise hors ligne.*
