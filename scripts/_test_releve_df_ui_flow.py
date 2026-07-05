#!/usr/bin/env python3
"""Test flux UI : équipes/stations DF par défaut puis Relevé DF menu contextuel."""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def test_no_station_alert_after_removal():
    """Mission aéronef : stations supprimées → alerte section Équipes."""
    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")

        page.locator("summary", has_text="Missions SAR").click()
        page.wait_for_timeout(300)
        page.fill("#sarNewMissionName", "Sans stations")
        page.select_option("#sarNewMissionType", "aeronef")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(400)

        page.evaluate(
            """() => {
              const s = CartoffSar.getStore();
              const m = s.missions.find(x => x.id === s.activeMissionId);
              if (!m || !Array.isArray(m.features)) return;
              m.features = m.features.filter(f => (f.properties || {})['sar:role'] !== 'station_df');
            }"""
        )
        page.wait_for_timeout(200)

        page.locator("#sarModeCheckbox").check()
        page.wait_for_timeout(300)

        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(400)

        clicked = page.evaluate(
            """() => {
              const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
                .find(b => /^Relevé DF$/i.test(b.textContent.trim()));
              if (!btn) return { ok: false };
              btn.click();
              return { ok: true };
            }"""
        )
        page.wait_for_timeout(400)

        diag = page.evaluate(
            """() => {
              const s = CartoffSar.getStore();
              const m = s.missions.find(x => x.id === s.activeMissionId);
              const st = f => (f.properties || {})['sar:role'] === 'station_df';
              const feats = Array.isArray(m.features)
                ? m.features
                : (m.features && m.features.features || []);
              return {
                teamCount: (m.teams || []).length,
                teamNames: (m.teams || []).map(t => t.name),
                stationCount: feats.filter(st).length,
                panelHidden: document.getElementById('sarPanel').hidden
              };
            }"""
        )
        browser.close()

    print("NO STATIONS:", json.dumps({"diag": diag, "dialogs": dialogs, "clicked": clicked}, ensure_ascii=False))
    assert clicked.get("ok"), "Relevé DF absent du menu contextuel"
    assert diag.get("teamCount") == 3
    assert diag.get("stationCount") == 0
    assert diag.get("panelHidden") is True
    assert len(dialogs) == 1
    msg = dialogs[0]
    assert "Aucune station DF positionnée" in msg
    assert "Section Équipes" in msg
    assert "Alpha" in msg
    return True


def main():
    errors = []
    dialogs = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))

        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")

        page.locator("summary", has_text="Missions SAR").click()
        page.wait_for_timeout(300)

        page.fill("#sarNewMissionName", "Test DF")
        page.select_option("#sarNewMissionType", "aeronef")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(500)

        store_init = page.evaluate(
            """() => {
              const s = CartoffSar.getStore();
              const m = s.missions.find(x => x.id === s.activeMissionId);
              const st = f => (f.properties || {})['sar:role'] === 'station_df';
              const stations = (m.features || []).filter(st);
              return {
                teamNames: (m.teams || []).map(t => t.name),
                stationCount: stations.length,
                coords: stations.map(f => f.geometry && f.geometry.coordinates)
              };
            }"""
        )
        print("STORE AFTER CREATE:", json.dumps(store_init, indent=2, ensure_ascii=False))

        page.locator("#sarModeCheckbox").check()
        page.wait_for_timeout(300)

        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(400)

        dialogs.clear()
        clicked = page.evaluate(
            """() => {
              const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
                .find(b => /^Relevé DF$/i.test(b.textContent.trim()));
              if (!btn) return {
                ok: false,
                labels: Array.from(document.querySelectorAll('#mapContextMenu button'))
                  .map(b => b.textContent.trim())
              };
              btn.click();
              return { ok: true };
            }"""
        )
        page.wait_for_timeout(500)

        panel = page.evaluate(
            """() => ({
              hidden: document.getElementById('sarPanel').hidden,
              title: document.getElementById('sarPanelTitle')
                && document.getElementById('sarPanelTitle').textContent
            })"""
        )
        print("RELEVE CLICK:", json.dumps(clicked, indent=2, ensure_ascii=False))
        print("DIALOGS:", dialogs)
        print("PANEL:", json.dumps(panel, indent=2, ensure_ascii=False))
        print("ERRORS:", errors)

        browser.close()

    ok = (
        store_init.get("stationCount", 0) == 3
        and store_init.get("teamNames") == ["Alpha", "Bravo", "Charlie"]
        and clicked.get("ok")
        and not panel.get("hidden")
        and not any("Placez" in d for d in dialogs)
        and "Relèvement" in (panel.get("title") or "")
    )
    return ok


def test_mission_switch_during_station_save():
    """Station via Équipes ; changement mission avant Enregistrer."""
    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")
        page.locator("summary", has_text="Missions SAR").click()
        page.fill("#sarNewMissionName", "Pers")
        page.select_option("#sarNewMissionType", "personne")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(400)
        personne_id = page.evaluate("() => CartoffSar.getStore().activeMissionId")
        page.fill("#sarNewMissionName", "Aero")
        page.select_option("#sarNewMissionType", "aeronef")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(400)
        aeronef_id = page.evaluate("() => CartoffSar.getStore().activeMissionId")
        page.locator(".sar-team-place-btn").first.click()
        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy)
        page.wait_for_timeout(400)
        page.evaluate(
            """([personneId]) => {
              const s = CartoffSar.getStore();
              s.activeMissionId = personneId;
            }""",
            [personne_id],
        )
        page.click("#sarPanelSave", force=True)
        page.wait_for_timeout(500)
        diag = page.evaluate(
            """([personneId, aeronefId]) => {
              const s = CartoffSar.getStore();
              const pers = s.missions.find(m => m.id === personneId);
              const aero = s.missions.find(m => m.id === aeronefId);
              const st = f => (f.properties || {})['sar:role'] === 'station_df';
              return {
                activeId: s.activeMissionId,
                personneStations: (pers.features || []).filter(st).length,
                aeronefStations: (aero.features || []).filter(st).length
              };
            }""",
            [personne_id, aeronef_id],
        )
        print("MISSION SWITCH SAVE:", json.dumps(diag, indent=2))
        page.select_option("#sarMissionSelect", aeronef_id)
        page.wait_for_timeout(300)
        page.locator("#sarModeCheckbox").check()
        page.wait_for_timeout(200)
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(400)
        dialogs.clear()
        page.evaluate(
            """() => {
              const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
                .find(b => /^Relevé DF$/i.test(b.textContent.trim()));
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(500)
        panel = page.evaluate(
            """() => ({
              hidden: document.getElementById('sarPanel').hidden,
              title: document.getElementById('sarPanelTitle') && document.getElementById('sarPanelTitle').textContent
            })"""
        )
        print("DIALOGS:", dialogs)
        print("PANEL:", json.dumps(panel, indent=2))
        browser.close()
        return (
            diag.get("aeronefStations", 0) >= 3
            and diag.get("personneStations", 0) == 0
            and not panel.get("hidden")
            and not any("Placez" in d for d in dialogs)
        )


if __name__ == "__main__":
    ok_alert = test_no_station_alert_after_removal()
    ok_main = main()
    ok_switch = test_mission_switch_during_station_save()
    sys.exit(0 if ok_alert and ok_main and ok_switch else 1)
