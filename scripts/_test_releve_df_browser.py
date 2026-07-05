#!/usr/bin/env python3
"""Test Relevé DF panel opening via Playwright."""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    errors = []
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)

        init_state = page.evaluate("""() => ({
          cartoffSar: typeof CartoffSar !== 'undefined',
          sarPanel: !!document.getElementById('sarPanel'),
          getLastRightClickLatLng: typeof window.getLastRightClickLatLng,
          sarModeActive: typeof CartoffSar !== 'undefined' ? CartoffSar.isSarModeActive() : null,
          store: typeof CartoffSar !== 'undefined' ? CartoffSar.getStore() : null
        })""")
        print("INIT:", json.dumps(init_state, indent=2, default=str))

        # Enable SAR mode if checkbox exists
        page.evaluate("""() => {
          const cb = document.querySelector('#sarModeToggle, input[type=checkbox][id*="sar"], .sar-mode-cb');
          if (cb && !cb.checked) cb.click();
          // Also try sidebar checkbox by label
          document.querySelectorAll('input[type=checkbox]').forEach(el => {
            const lbl = el.closest('label') || el.parentElement;
            if (lbl && /mode sar/i.test(lbl.textContent || '') && !el.checked) el.click();
          });
        }""")

        # Setup aeronef mission with station via localStorage if needed
        setup = page.evaluate("""() => {
          if (typeof CartoffSar === 'undefined') return { ok: false, reason: 'no CartoffSar' };
          const store = CartoffSar.getStore();
          let mission = store.missions && store.missions.find(m => m.type === 'aeronef');
          if (!mission) {
            mission = {
              id: 'test-aeronef-' + Date.now(),
              type: 'aeronef',
              label: 'Test aéronef',
              statut: 'actif',
              features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [5.5, 43.5] },
                properties: {
                  id: 'st-test-1',
                  'sar:role': 'station_df',
                  'sar:mission_id': null,
                  label: 'Station test'
                }
              }]
            };
            mission.features[0].properties['sar:mission_id'] = mission.id;
            if (!store.missions) store.missions = [];
            store.missions.push(mission);
            store.activeMissionId = mission.id;
            localStorage.setItem('cartoff_sar_missions', JSON.stringify({
              version: 1,
              missions: store.missions,
              activeMissionId: store.activeMissionId,
              sarModeActive: true
            }));
            location.reload();
            return { ok: true, reloaded: true };
          }
          store.activeMissionId = mission.id;
          if (!mission.features) mission.features = [];
          let st = mission.features.find(f => f.properties && f.properties['sar:role'] === 'station_df');
          if (!st) {
            st = {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [5.5, 43.5] },
              properties: {
                id: 'st-test-1',
                'sar:role': 'station_df',
                'sar:mission_id': mission.id,
                label: 'Station test'
              }
            };
            mission.features.push(st);
          }
          return { ok: true, missionId: mission.id, stations: mission.features.filter(f => f.properties && f.properties['sar:role'] === 'station_df').length };
        }""")

        if setup.get("reloaded"):
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1000)
            setup = page.evaluate("""() => {
              const store = CartoffSar.getStore();
              const mission = store.missions.find(m => m.type === 'aeronef');
              return {
                ok: true,
                missionId: mission && mission.id,
                sarMode: CartoffSar.isSarModeActive(),
                missionCount: store.missions.length
              };
            }""")

        print("SETUP:", json.dumps(setup, indent=2, default=str))

        # Enable SAR mode
        page.evaluate("""() => {
          document.querySelectorAll('input[type=checkbox]').forEach(el => {
            const ctx = (el.closest('label') || el.parentElement || {}).textContent || '';
            if (/sar/i.test(ctx) && !el.checked) el.click();
          });
        }""")

        # Right-click on map center
        map_box = page.locator("#map").bounding_box()
        if not map_box:
            print("ERROR: #map not found")
            sys.exit(1)
        cx = map_box["x"] + map_box["width"] / 2
        cy = map_box["y"] + map_box["height"] / 2
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(500)

        menu_visible = page.evaluate("""() => {
          const m = document.getElementById('mapContextMenu');
          return m && !m.hidden;
        }""")
        print("MENU VISIBLE:", menu_visible)

        menu_items = page.evaluate("""() => {
          const m = document.getElementById('mapContextMenu');
          if (!m) return [];
          return Array.from(m.querySelectorAll('button')).map(b => ({
            text: b.textContent.trim(),
            hidden: b.offsetParent === null,
            parentHidden: b.closest('[hidden]') !== null
          }));
        }""")
        print("MENU ITEMS:", json.dumps(menu_items, indent=2, ensure_ascii=False))

        # Expand Mission SAR if present
        page.evaluate("""() => {
          const m = document.getElementById('mapContextMenu');
          if (!m) return;
          m.querySelectorAll('.map-context-menu-submenu-toggle').forEach(t => {
            if (/mission sar/i.test(t.textContent) && t.classList.contains('is-open') === false) t.click();
          });
        }""")
        page.wait_for_timeout(200)

        # Click Relevé DF
        clicked = page.evaluate("""() => {
          const m = document.getElementById('mapContextMenu');
          if (!m) return { ok: false, reason: 'no menu' };
          const btns = Array.from(m.querySelectorAll('button'));
          const btn = btns.find(b => /relevé df/i.test(b.textContent));
          if (!btn) return { ok: false, reason: 'no btn', labels: btns.map(b => b.textContent.trim()) };
          btn.click();
          return { ok: true, label: btn.textContent.trim() };
        }""")
        print("CLICK RELEVE DF:", json.dumps(clicked, indent=2, ensure_ascii=False))
        page.wait_for_timeout(500)

        panel_state = page.evaluate("""() => ({
          panelHidden: document.getElementById('sarPanel').hidden,
          panelDisplay: document.getElementById('sarPanel').style.display,
          panelTitle: document.getElementById('sarPanelTitle') && document.getElementById('sarPanelTitle').textContent,
          bearingFieldsHidden: document.getElementById('sarPanelBearingFields').hidden
        })""")
        print("PANEL STATE:", json.dumps(panel_state, indent=2, ensure_ascii=False))

        # Direct call test
        direct = page.evaluate("""() => {
          const ll = window.getLastRightClickLatLng && window.getLastRightClickLatLng();
          if (typeof CartoffSar.openReleveDfDirect === 'function') {
            CartoffSar.openReleveDfDirect(ll, 400, 300, null);
            return { method: 'openReleveDfDirect', ll: ll ? { lat: ll.lat, lng: ll.lng } : null };
          }
          return { method: 'missing', ll: ll ? { lat: ll.lat, lng: ll.lng } : null };
        }""")
        print("DIRECT CALL:", json.dumps(direct, indent=2, default=str))
        page.wait_for_timeout(300)

        panel_after_direct = page.evaluate("""() => ({
          panelHidden: document.getElementById('sarPanel').hidden,
          panelTitle: document.getElementById('sarPanelTitle') && document.getElementById('sarPanelTitle').textContent
        })""")
        print("PANEL AFTER DIRECT:", json.dumps(panel_after_direct, indent=2))

        if errors:
            print("PAGE ERRORS:", errors)
        if console_errors:
            print("CONSOLE ERRORS:", console_errors)

        browser.close()

    return panel_state.get("panelHidden") is False or panel_after_direct.get("panelHidden") is False


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
