#!/usr/bin/env python3

"""Vérifie la structure SAR (types, persistance JSON, aéronef DF) hors navigateur."""

import json

import re

from pathlib import Path



ROOT = Path(__file__).resolve().parents[1]



SAR_ROLES_PERSONNE = {"lkp", "indice", "waypoint", "trace_fouille", "axe_probable"}

SAR_ROLES_AERONEF = {"station_df", "relevement_df", "releve_point", "fixe_estime", "incertitude_fix"}

SAR_ROLES = SAR_ROLES_PERSONNE | SAR_ROLES_AERONEF

SAR_MISSION_TYPES = {"personne", "aeronef"}

SAR_PROPS = {

    "sar:mission_id",

    "sar:role",

    "sar:mission_type",

    "sar:azimuth",

    "sar:range_km",

    "sar:bearing_reciprocal",

    "sar:station_id",

    "sar:bearing_group_id",

    "sar:quality_angle",

    "sar:uncertainty_km",

    "sar:fix_station_ids",

    "sar:fix_index",

    "sar:fix_is_best",

    "sar:fix_color",

    "sar:elevation_m",

}





def test_libs_present():

    for rel in ("js/sar-types.js", "js/sar-missions.js"):

        p = ROOT / rel

        assert p.is_file() and p.stat().st_size > 500, rel

        print("OK lib:", rel, p.stat().st_size, "bytes")





def test_types_file_roles():

    text = (ROOT / "js" / "sar-types.js").read_text(encoding="utf-8")

    for role in SAR_ROLES:

        assert f"{role}:" in text or f'"{role}"' in text, role

    for prop in SAR_PROPS:

        assert prop in text, prop

    assert "aeronef" in text

    assert "enabled: true" in text or "enabled:true" in text.replace(" ", "")

    assert "destinationPoint" in text

    assert "bearingLineCoordinates" in text

    assert "buildBearingLineFeature" in text

    assert "point de relevé" in text.lower() or "Point de relevé" in text

    assert "intersectBearings" in text

    assert "computeAllIntersections" in text

    assert "computeBestIntersection" in text

    assert "bearingPairKey" in text

    assert "FIX_COLOR_PALETTE" in text

    assert "fixe_estime" in text

    print("OK sar-types.js roles, props et géométrie DF")





def test_aeronef_enabled_not_stubbed():

    text = (ROOT / "js" / "sar-types.js").read_text(encoding="utf-8")

    assert re.search(r"aeronef:\s*\{[^}]*enabled:\s*true", text, re.DOTALL), "aeronef doit être activé"

    assert "Bientôt" not in text

    missions = (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    assert "station_df" in missions

    assert "relevement_df" in missions or "addBearing" in missions

    assert "bearing_group_id" in missions or "PROP_BEARING_GROUP_ID" in missions

    assert "repairBearingGeometries" in missions

    assert "findRelevePointInGroup" in missions

    assert "resolveBearingOrigin" in missions

    assert "signal arrière" in missions

    assert "applyBearingPreviewPolylines" in missions

    assert "computeAndApplyIntersection" in missions

    assert "visibleFixIds" in missions

    assert "sar-fix-visibility-cb" in missions

    assert "getEstimatedFixFeatures" in missions

    assert "exportSarReport" in missions

    print("OK aéronef activé et workflow DF dans sar-missions.js")





def test_store_roundtrip_personne():

    store = {

        "version": 1,

        "activeMissionId": "m1",

        "missions": [

            {

                "id": "m1",

                "name": "Test SAR",

                "type": "personne",

                "status": "active",

                "created_at": "2026-07-01T12:00:00.000Z",

                "features": [

                    {

                        "type": "Feature",

                        "geometry": {"type": "Point", "coordinates": [4.0, 45.5]},

                        "properties": {

                            "id": "f1",

                            "sar:mission_id": "m1",

                            "sar:role": "lkp",

                            "sar:mission_type": "personne",

                            "label": "LKP test",

                            "notes": "",

                            "created_at": "2026-07-01T12:01:00.000Z",

                        },

                    }

                ],

            }

        ],

    }

    raw = json.dumps(store)

    data = json.loads(raw)

    feat = data["missions"][0]["features"][0]

    props = feat["properties"]

    assert props["sar:role"] in SAR_ROLES

    assert props["sar:mission_type"] in SAR_MISSION_TYPES

    assert feat["geometry"]["type"] == "Point"

    print("OK store JSON roundtrip personne")





def test_store_roundtrip_aeronef_bearing_pair():

    group_id = "grp-1"

    station_id = "st-1"

    store = {

        "version": 1,

        "activeMissionId": "m2",

        "missions": [

            {

                "id": "m2",

                "name": "DF test",

                "type": "aeronef",

                "status": "active",

                "created_at": "2026-07-01T12:00:00.000Z",

                "features": [

                    {

                        "type": "Feature",

                        "geometry": {"type": "Point", "coordinates": [4.85, 45.75]},

                        "properties": {

                            "id": station_id,

                            "sar:mission_id": "m2",

                            "sar:role": "station_df",

                            "sar:mission_type": "aeronef",

                            "label": "Station A",

                            "notes": "",

                            "created_at": "2026-07-01T12:00:00.000Z",

                        },

                    },

                    {

                        "type": "Feature",

                        "geometry": {

                            "type": "LineString",

                            "coordinates": [[4.85, 45.75], [4.9, 45.8]],

                        },

                        "properties": {

                            "id": "br-1",

                            "sar:mission_id": "m2",

                            "sar:role": "relevement_df",

                            "sar:mission_type": "aeronef",

                            "sar:azimuth": 45.0,

                            "sar:range_km": 30,

                            "sar:bearing_reciprocal": False,

                            "sar:station_id": station_id,

                            "sar:bearing_group_id": group_id,

                            "label": "Relèvement 45°",

                            "notes": "",

                            "created_at": "2026-07-01T12:05:00.000Z",

                        },

                    },

                    {

                        "type": "Feature",

                        "geometry": {

                            "type": "LineString",

                            "coordinates": [[4.85, 45.75], [4.8, 45.7]],

                        },

                        "properties": {

                            "id": "br-2",

                            "sar:mission_id": "m2",

                            "sar:role": "relevement_df",

                            "sar:mission_type": "aeronef",

                            "sar:azimuth": 225.0,

                            "sar:range_km": 30,

                            "sar:bearing_reciprocal": True,

                            "sar:station_id": station_id,

                            "sar:bearing_group_id": group_id,

                            "label": "Relèvement 45° (réciproque)",

                            "notes": "",

                            "created_at": "2026-07-01T12:05:00.000Z",

                        },

                    },

                ],

            }

        ],

    }

    data = json.loads(json.dumps(store))

    feats = data["missions"][0]["features"]

    assert len(feats) == 3

    reception = next(f for f in feats if f["properties"].get("sar:bearing_reciprocal") is False)

    reciprocal = next(f for f in feats if f["properties"].get("sar:bearing_reciprocal") is True)

    assert reception["properties"]["sar:bearing_group_id"] == reciprocal["properties"]["sar:bearing_group_id"]

    assert reception["properties"]["sar:station_id"] == station_id

    assert reciprocal["properties"]["sar:azimuth"] == 225.0

    print("OK store JSON roundtrip aéronef (paire relèvements)")





def test_store_roundtrip_aeronef_fix():

    fix_id = "fix-1"

    unc_id = "unc-1"

    store = {

        "version": 1,

        "activeMissionId": "m3",

        "missions": [

            {

                "id": "m3",

                "name": "Fix test",

                "type": "aeronef",

                "status": "active",

                "created_at": "2026-07-01T12:00:00.000Z",

                "features": [

                    {

                        "type": "Feature",

                        "geometry": {"type": "Point", "coordinates": [4.9, 45.78]},

                        "properties": {

                            "id": fix_id,

                            "sar:mission_id": "m3",

                            "sar:role": "fixe_estime",

                            "sar:mission_type": "aeronef",

                            "sar:quality_angle": 87.5,

                            "sar:uncertainty_km": 2,

                            "sar:fix_station_ids": "st-a,st-b",

                            "label": "Fixe estimé",

                            "notes": "",

                            "created_at": "2026-07-01T12:10:00.000Z",

                        },

                    },

                    {

                        "type": "Feature",

                        "geometry": {

                            "type": "Polygon",

                            "coordinates": [[[4.89, 45.77], [4.91, 45.77], [4.9, 45.79], [4.89, 45.77]]],

                        },

                        "properties": {

                            "id": unc_id,

                            "sar:mission_id": "m3",

                            "sar:role": "incertitude_fix",

                            "sar:mission_type": "aeronef",

                            "sar:uncertainty_km": 2,

                            "sar:fix_station_ids": fix_id,

                            "label": "Incertitude",

                            "notes": "",

                            "created_at": "2026-07-01T12:10:00.000Z",

                        },

                    },

                ],

            }

        ],

    }

    data = json.loads(json.dumps(store))

    feats = data["missions"][0]["features"]

    fix = next(f for f in feats if f["properties"]["sar:role"] == "fixe_estime")

    assert fix["properties"]["sar:quality_angle"] == 87.5

    assert fix["geometry"]["type"] == "Point"

    print("OK store JSON roundtrip aéronef (fixe SAR-3)")





def test_index_wiring():

    html = (ROOT / "index.html").read_text(encoding="utf-8")

    assert "js/sar-types.js" in html

    assert "js/sar-missions.js" in html

    assert "setupFloatingPanelDrag" in html

    assert "Missions SAR" in html
    assert "operationRechercheBlock" in html
    assert "appendSecoursContextMenu" in html
    assert "OPÉRATION DE SECOURS" in html

    assert "CartoffSar.init" in html

    assert "sarPane" in html

    assert "sarPanelAzimuth" in html

    assert "sarPanelRange" in html

    assert "Trait plein = signal direct" in html

    assert "sar-marker-station-df" in html

    assert "sar-marker-fixe-estime" in html

    assert "sarComputeIntersectionBtn" in (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    assert re.search(r"cartoff_sar_missions", (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8"))
    assert "sarModeActive" in (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")
    assert "wireSidebarDelegation" in (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")
    assert "resolveActiveMissionId" in (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")
    assert "Sélectionner une mission" in (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    print("OK index.html branchement SAR et panneau DF")





def test_sar_mode_checkbox_wiring():

    text = (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    assert "id=\"sarModeCheckbox\"" in text
    assert "function wireSidebarDelegation()" in text
    assert "function resolveActiveMissionId()" in text
    assert "sarModeActive" in text
    assert "localStorage.setItem(STORAGE_KEY" in text
    assert "mission && canEdit ? '' : ' disabled'" in text
    assert "Sélectionnez une mission dans « Mission active »" in text

    print("OK Mode SAR checkbox et persistance")





def test_releve_df_station_discovery():

    text = (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    assert "function stationFeatures(mission)" in text

    assert "function isStationDfFeature(f)" in text

    assert "featureRoleId(f.properties) === 'station_df'" in text

    assert "appendReleveDfContextMenu" in text

    assert "invokeReleveDfFromMenu" in text

    assert "getLastRightClickLatLng" in (ROOT / "index.html").read_text(encoding="utf-8")

    assert "lastRightClickLatLng" in (ROOT / "index.html").read_text(encoding="utf-8")

    assert "function alertNoStationDf(mission)" in text

    assert "Aucune station DF positionnée" in text

    assert "Placer sur carte" in text

    assert "DEFAULT_AERONEF_DF_TEAMS" in text

    assert "function ensureDefaultAeronefTeams" in text

    assert "function startTeamStationPlaceMode" in text

    assert "sar-team-place-btn" in text

    assert "function isStationPlaced" in text

    assert "function findStationForTeam" in text

    assert not re.search(
        r"if \(mission\.type === 'aeronef'\)[\s\S]*?addItem\('Station DF'",
        text,
    ), "menu contextuel ne doit plus proposer Station DF pour aéronef"

    assert "showBearingStationPicker" in text

    assert "openBearingPanel" in text

    assert "startBearingFlow" in text

    assert "releveDfAfterTargetClick" in text

    assert "captureBearingTargetContext" in text

    assert "bearingClickContext" in text

    assert "pendingBearingClickContext" in text

    assert "clearBearingClickContexts" in text

    assert "adoptBearingClickContext" in text

    assert "function resolveMenuClickLatLng" in text

    assert "function menuTargetClickLatLng" in text

    assert "target.clickLatlng" in text

    assert "buildRelevePointFeature" in text

    assert "startBearingPickMode" in text

    assert "onBearingTargetPickClick" in text

    # Ne plus filtrer sar:mission_id sur les features déjà dans mission.features

    assert "isStationDfFeatureForMission" in text

    assert "syncMissionStationsFromLayer" in text

    assert "trustMission" in text

    assert re.search(
        r"function stationFeaturesFromLayer[\s\S]*?if \(!group\) return out",
        text,
    ), "stationFeaturesFromLayer ne doit pas exiger map"

    assert "beginReleveDfFromContext" in text

    # Clic droit sur marqueur station : pas de mode pick carte (sidebar seul)
    assert re.search(
        r"featureRoleId\(props\) === 'station_df'[\s\S]*?invokeReleveDfFromMenu",
        text,
    ), "clic droit station DF doit utiliser invokeReleveDfFromMenu"
    assert not re.search(
        r"featureRoleId\(props\) === 'station_df'[\s\S]*?startBearingPickMode",
        text,
    ), "clic droit station DF ne doit pas lancer startBearingPickMode"

    assert "resolveStationsForReleveDf" in text

    assert "debugStationDiscovery" in text

    assert re.search(
        r"function resolveStationsForReleveDf[\s\S]*?rebuildLayer\(\)",
        text,
    ), "resolveStationsForReleveDf doit resynchroniser le calque avant relevé"

    assert re.search(
        r"function collectStationDfFeatures[\s\S]*?missionFeaturesList\(mission\)[\s\S]*?stationFeaturesFromLayer",
        text,
    ), "collectStationDfFeatures doit fusionner mission.features et calque carte"

    assert re.search(
        r"function stationFeatures\(mission\)[\s\S]*?collectStationDfFeatures",
        text,
    ), "stationFeatures doit s'appuyer sur collectStationDfFeatures"

    assert re.search(
        r"function stationFeaturesFromLayer[\s\S]*?isStationDfFeature\(feat\)",
        text,
    ), "stationFeaturesFromLayer doit compter les station_df du calque actif"

    print("OK Relevé DF — découverte stations et sous-menu contextuel")





def test_aeronef_default_teams_and_stations():

    text = (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    assert "DEFAULT_AERONEF_DF_TEAMS" in text

    assert "'Alpha', 'Bravo', 'Charlie'" in text

    assert "DEFAULT_SDIS_42" in text

    assert "45.46539" in text

    assert "4.38530" in text

    assert "function ensureDefaultAeronefStations" in text

    assert "function buildDefaultStationFeature" in text

    assert "sar-team-place-btn" in text

    assert "default_stations_at_sdis42" in text

    assert "data-sar-action" not in text

    assert "sar-aeronef-btn" not in text

    assert re.search(
        r"function createMission[\s\S]*?ensureDefaultAeronefStations\(mission",
        text,
    ), "createMission doit créer les stations DF par défaut"

    assert "PROP_TEAM_ID" in (ROOT / "js" / "sar-types.js").read_text(encoding="utf-8")

    assert "PROP_TEAM_NAME" in (ROOT / "js" / "sar-types.js").read_text(encoding="utf-8")

    print("OK aéronef — équipes et stations DF SDIS 42 par défaut")





def test_bearing_click_context_reset():

    text = (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    assert "function clearBearingClickContexts()" in text

    assert "function adoptBearingClickContext(clickContext)" in text

    assert "bearingClickContext = null" in text

    assert "pendingBearingClickContext = null" in text

    # save : source unique + reset après enregistrement

    assert re.search(

        r"mode === 'addBearing'[\s\S]*?getBearingTargetContext\(\)",

        text,

    ), "saveBearingPanel doit lire le contexte clic via getBearingTargetContext"

    assert re.search(

        r"function closePanel\(\)[\s\S]*?clearBearingClickContexts\(\)",

        text,

    ), "closePanel doit invalider le contexte clic relevé"

    assert re.search(

        r"function startBearingPickMode[\s\S]*?clearBearingClickContexts\(\)",

        text,

    ), "chaque nouveau pick doit effacer l'ancien contexte"

    assert re.search(

        r"function openBearingPanel[\s\S]*?stopBearingPickMode\(\)",

        text,

    ), "openBearingPanel doit quitter le mode pick"

    # édition : pas de réutilisation du contexte add

    assert re.search(

        r"if \(editGroupId\) \{[\s\S]*?clearBearingClickContexts\(\)",

        text,

    ), "editBearing ne doit pas réutiliser bearingClickContext"

    print("OK Relevé DF — reset contexte clic entre relevés")





def test_three_station_intersections():

    """3 stations × 1 relèvement → 3 paires distinctes (pas de fusion par coordonnées)."""

    import subprocess

    script = ROOT / "scripts" / "_test_intersections.mjs"

    assert script.is_file(), script

    node = Path(r"C:\Program Files\nodejs\node.exe")

    if not node.is_file():

        import shutil

        node = shutil.which("node") or "node"

    out = subprocess.run(

        [str(node), str(script)],

        capture_output=True,

        text=True,

        cwd=str(ROOT),

        timeout=30,

    )

    assert out.returncode == 0, out.stderr or out.stdout

    assert "3 candidate(s)" in out.stdout, out.stdout

    print("OK 3 stations -> 3 candidats intersection (dedup par paire)")





def test_bearing_opposite_directions():

    """Réception 38.1° et réciproque 218.1° depuis la même station (pas la même direction)."""

    import subprocess

    script = ROOT / "scripts" / "_test_bearing_dirs.mjs"

    assert script.is_file(), script

    node = Path(r"C:\Program Files\nodejs\node.exe")

    if not node.is_file():

        import shutil

        node = shutil.which("node") or "node"

    out = subprocess.run(

        [str(node), str(script)],

        capture_output=True,

        text=True,

        cwd=str(ROOT),

        timeout=30,

    )

    assert out.returncode == 0, out.stderr or out.stdout

    assert "OK bearing opposite directions" in out.stdout, out.stdout

    print("OK relèvement réception / réciproque directions opposées")





if __name__ == "__main__":

    test_libs_present()

    test_types_file_roles()

    test_aeronef_enabled_not_stubbed()

    test_store_roundtrip_personne()

    test_store_roundtrip_aeronef_bearing_pair()

    test_store_roundtrip_aeronef_fix()

    test_index_wiring()

    test_sar_mode_checkbox_wiring()

    test_releve_df_station_discovery()

    test_aeronef_default_teams_and_stations()

    test_bearing_click_context_reset()

    test_three_station_intersections()

    test_bearing_opposite_directions()

    print("Tous les tests SAR OK")

