#!/usr/bin/env python3

"""Vérifie la structure SAR (types, persistance JSON, aéronef DF) hors navigateur."""

import json

import re

from pathlib import Path



ROOT = Path(__file__).resolve().parents[1]



SAR_ROLES_PERSONNE = {"lkp", "indice", "waypoint", "trace_fouille", "axe_probable"}

SAR_ROLES_AERONEF = {"station_df", "relevement_df", "fixe_estime", "incertitude_fix"}

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

    assert "Missions SAR" in html

    assert "CartoffSar.init" in html

    assert "sarPane" in html

    assert "sarPanelAzimuth" in html

    assert "sarPanelRange" in html

    assert "sar-marker-station-df" in html

    assert "sar-marker-fixe-estime" in html

    assert "sarComputeIntersectionBtn" in (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8")

    assert re.search(r"cartoff_sar_missions", (ROOT / "js" / "sar-missions.js").read_text(encoding="utf-8"))

    print("OK index.html branchement SAR et panneau DF")





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





if __name__ == "__main__":

    test_libs_present()

    test_types_file_roles()

    test_aeronef_enabled_not_stubbed()

    test_store_roundtrip_personne()

    test_store_roundtrip_aeronef_bearing_pair()

    test_store_roundtrip_aeronef_fix()

    test_index_wiring()

    test_three_station_intersections()

    print("Tous les tests SAR OK")

