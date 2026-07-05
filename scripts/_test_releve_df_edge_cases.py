#!/usr/bin/env python3
"""Edge cases for Relevé DF station detection."""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def run_fc_scenario():
    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")
        page.locator("summary", has_text="Missions SAR").click()
        page.evaluate(
            """() => {
          const id = 'fc-mission-1';
          const stId = 'st-fc-1';
          const store = {
            version: 1,
            activeMissionId: id,
            sarModeActive: true,
            missions: [{
              id, name: 'FC test', type: 'aeronef', status: 'active',
              created_at: new Date().toISOString(),
              features: { type: 'FeatureCollection', features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [4.85, 45.75] },
                properties: {
                  id: stId, 'sar:role': 'station_df', 'sar:mission_id': id,
                  'sar:mission_type': 'aeronef', label: 'St FC', notes: '',
                  created_at: new Date().toISOString()
                }
              }]}
            }]
          };
          localStorage.setItem('cartoff_sar_missions', JSON.stringify(store));
        }"""
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(500)
        page.locator("summary", has_text="Missions SAR").click()
        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(400)
        clicked = page.evaluate(
            """() => {
          const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
            .find(b => /Relevé DF/i.test(b.textContent));
          if (btn) { btn.click(); return true; }
          return false;
        }"""
        )
        page.wait_for_timeout(400)
        result = page.evaluate(
            """() => {
          const s = CartoffSar.getStore();
          const m = s.missions[0];
          const feats = Array.isArray(m.features)
            ? m.features
            : (m.features && m.features.features || []);
          return {
            featuresIsArray: Array.isArray(m.features),
            stationInStore: feats.filter(f => (f.properties||{})['sar:role']==='station_df').length,
            panelHidden: document.getElementById('sarPanel').hidden,
            panelTitle: document.getElementById('sarPanelTitle') && document.getElementById('sarPanelTitle').textContent
          };
        }"""
        )
        result["clicked"] = clicked
        result["dialogs"] = list(dialogs)
        browser.close()
        return result


def run_save_to_fc_then_releve():
    """Create aeronef via UI, corrupt features to FC wrapper after save attempt."""
    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")
        page.locator("summary", has_text="Missions SAR").click()
        page.fill("#sarNewMissionName", "Test FC save")
        page.select_option("#sarNewMissionType", "aeronef")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(400)
        page.locator(".sar-team-row", has_text="Alpha").locator(".sar-team-place-btn").click()
        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy)
        page.wait_for_timeout(400)
        page.click("#sarPanelSave")
        page.wait_for_timeout(400)
        # Corrupt to FeatureCollection wrapper (simulate bad import)
        page.evaluate(
            """() => {
          const s = CartoffSar.getStore();
          const m = s.missions.find(x => x.id === s.activeMissionId);
          if (m && Array.isArray(m.features)) {
            m.features = { type: 'FeatureCollection', features: m.features.slice() };
            localStorage.setItem('cartoff_sar_missions', JSON.stringify({
              version: s.version,
              activeMissionId: s.activeMissionId,
              missions: s.missions,
              sarModeActive: true
            }));
          }
        }"""
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(500)
        page.locator("summary", has_text="Missions SAR").click()
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(400)
        dialogs.clear()
        page.evaluate(
            """() => {
          const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
            .find(b => /Relevé DF/i.test(b.textContent));
          if (btn) btn.click();
        }"""
        )
        page.wait_for_timeout(400)
        result = page.evaluate(
            """() => ({
          featuresIsArray: (() => {
            const m = CartoffSar.getStore().missions.find(x => x.id === CartoffSar.getStore().activeMissionId);
            return Array.isArray(m && m.features);
          })(),
          panelHidden: document.getElementById('sarPanel').hidden,
          panelTitle: document.getElementById('sarPanelTitle') && document.getElementById('sarPanelTitle').textContent
        })"""
        )
        result["dialogs"] = list(dialogs)
        browser.close()
        return result


def run_draft_without_save():
    """Station draft marker visible but not saved."""
    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")
        page.locator("summary", has_text="Missions SAR").click()
        page.fill("#sarNewMissionName", "Draft test")
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
        page.locator(".sar-team-row", has_text="Alpha").locator(".sar-team-place-btn").click()
        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy)
        page.wait_for_timeout(400)
        # Do NOT save — right-click releve while station panel still open
        page.mouse.click(cx + 20, cy + 20, button="right")
        page.wait_for_timeout(400)
        menu_labels = page.evaluate(
            """() => Array.from(document.querySelectorAll('#mapContextMenu button'))
              .map(b => b.textContent.trim())"""
        )
        dialogs.clear()
        page.evaluate(
            """() => {
          const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
            .find(b => /Relevé DF/i.test(b.textContent));
          if (btn) btn.click();
        }"""
        )
        page.wait_for_timeout(400)
        result = page.evaluate(
            """() => {
          const s = CartoffSar.getStore();
          const m = s.missions.find(x => x.id === s.activeMissionId);
          return {
            stationCount: (m.features || []).filter(f => (f.properties||{})['sar:role']==='station_df').length,
            panelOpen: !document.getElementById('sarPanel').hidden
          };
        }"""
        )
        result["dialogs"] = list(dialogs)
        result["menuLabels"] = menu_labels
        browser.close()
        return result


def run_select_mission_not_create():
    """Two missions: select aeronef from dropdown, place station."""
    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")
        page.locator("summary", has_text="Missions SAR").click()
        # Create personne
        page.fill("#sarNewMissionName", "Pers")
        page.select_option("#sarNewMissionType", "personne")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(400)
        personne_id = page.evaluate("() => CartoffSar.getStore().activeMissionId")
        # Create aeronef
        page.fill("#sarNewMissionName", "Aero")
        page.select_option("#sarNewMissionType", "aeronef")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(400)
        aeronef_id = page.evaluate("() => CartoffSar.getStore().activeMissionId")
        # Uncheck SAR, select personne mission
        page.locator("#sarModeCheckbox").uncheck()
        page.select_option("#sarMissionSelect", personne_id)
        page.wait_for_timeout(300)
        # Select aeronef from dropdown
        page.select_option("#sarMissionSelect", aeronef_id)
        page.wait_for_timeout(300)
        page.locator("#sarModeCheckbox").check()
        page.wait_for_timeout(300)
        page.locator(".sar-team-row", has_text="Alpha").locator(".sar-team-place-btn").click()
        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy)
        page.wait_for_timeout(400)
        page.click("#sarPanelSave")
        page.wait_for_timeout(400)
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(400)
        dialogs.clear()
        page.evaluate(
            """() => {
          const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
            .find(b => /Relevé DF/i.test(b.textContent));
          if (btn) btn.click();
        }"""
        )
        page.wait_for_timeout(400)
        result = page.evaluate(
            """() => ({
          stationCount: (() => {
            const s = CartoffSar.getStore();
            const m = s.missions.find(x => x.id === s.activeMissionId);
            return (m.features || []).filter(f => (f.properties||{})['sar:role']==='station_df').length;
          })(),
          panelHidden: document.getElementById('sarPanel').hidden,
          panelTitle: document.getElementById('sarPanelTitle') && document.getElementById('sarPanelTitle').textContent
        })"""
        )
        result["dialogs"] = list(dialogs)
        browser.close()
        return result


if __name__ == "__main__":
    cases = [
        ("fc_load", run_fc_scenario),
        ("fc_after_save", run_save_to_fc_then_releve),
        ("draft_no_save", run_draft_without_save),
        ("select_dropdown", run_select_mission_not_create),
    ]
    failed = []
    for name, fn in cases:
        try:
            r = fn()
            print(f"=== {name} ===")
            print(json.dumps(r, indent=2, ensure_ascii=False))
            if any("Placez" in d for d in r.get("dialogs", [])):
                failed.append(name)
        except Exception as e:
            print(f"=== {name} ERROR ===", e)
            failed.append(name)
    if failed:
        print("FAILED:", failed)
        sys.exit(1)
    print("All edge cases OK")
