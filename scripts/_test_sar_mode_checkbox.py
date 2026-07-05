#!/usr/bin/env python3
"""Test Mode SAR checkbox enable/toggle/persist."""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def eval_state(page):
    return page.evaluate(
        """() => {
      const cb = document.getElementById('sarModeCheckbox');
      const sel = document.getElementById('sarMissionSelect');
      const stored = JSON.parse(localStorage.getItem('cartoff_sar_missions') || '{}');
      const mission = typeof CartoffSar !== 'undefined' && CartoffSar.getStore().activeMissionId
        ? CartoffSar.getStore().missions.find(m => m.id === CartoffSar.getStore().activeMissionId)
        : null;
      return {
        cartoffSar: typeof CartoffSar !== 'undefined',
        cbExists: !!cb,
        cbDisabled: cb ? cb.disabled : null,
        cbChecked: cb ? cb.checked : null,
        sarModeActive: typeof CartoffSar !== 'undefined' ? CartoffSar.isSarModeActive() : null,
        missions: typeof CartoffSar !== 'undefined' ? CartoffSar.getStore().missions.length : null,
        activeMissionId: typeof CartoffSar !== 'undefined' ? CartoffSar.getStore().activeMissionId : null,
        missionStatus: mission ? mission.status : null,
        sarModeInStorage: stored.sarModeActive,
        toolsVisible: !!document.querySelector('.sar-draw-tools'),
        hint: document.getElementById('sarHint') ? document.getElementById('sarHint').textContent.trim() : null,
        selectValue: sel ? sel.value : null,
        selectOptions: sel ? Array.from(sel.options).map(o => ({v: o.value, t: o.text})) : []
      };
    }"""
    )


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)

        page.evaluate(
            """() => {
          localStorage.removeItem('cartoff_sar_missions');
          location.reload();
        }"""
        )
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)

        page.locator("details").filter(has_text="Missions SAR").locator("summary").click()
        page.wait_for_timeout(300)

        print("INITIAL:", json.dumps(eval_state(page), indent=2, ensure_ascii=False))

        page.fill("#sarNewMissionName", "Test mission")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(500)
        print("AFTER CREATE:", json.dumps(eval_state(page), indent=2, ensure_ascii=False))

        page.evaluate(
            """() => {
          const cb = document.getElementById('sarModeCheckbox');
          if (cb && cb.checked) cb.click();
        }"""
        )
        page.wait_for_timeout(300)
        print("AFTER UNCHECK:", json.dumps(eval_state(page), indent=2, ensure_ascii=False))

        page.evaluate(
            """() => {
          const cb = document.getElementById('sarModeCheckbox');
          if (cb && !cb.checked) cb.click();
        }"""
        )
        page.wait_for_timeout(300)
        after_check = eval_state(page)
        print("AFTER CHECK:", json.dumps(after_check, indent=2, ensure_ascii=False))

        page.reload(wait_until="networkidle")
        page.wait_for_timeout(500)
        page.locator("details").filter(has_text="Missions SAR").locator("summary").click()
        page.wait_for_timeout(300)
        after_reload = eval_state(page)
        print("AFTER RELOAD:", json.dumps(after_reload, indent=2, ensure_ascii=False))

        # Multiple missions, none selected: checkbox disabled until selection
        page.evaluate(
            """() => {
          localStorage.setItem('cartoff_sar_missions', JSON.stringify({
            version: 1,
            activeMissionId: null,
            sarModeActive: false,
            missions: [
              { id: 'm1', name: 'Mission A', type: 'personne', status: 'active',
                created_at: '2026-01-01T00:00:00Z', features: [], teams: [] },
              { id: 'm2', name: 'Mission B', type: 'aeronef', status: 'active',
                created_at: '2026-01-01T00:00:00Z', features: [], teams: [] }
            ]
          }));
          location.reload();
        }"""
        )
        page.wait_for_load_state("networkidle")
        page.locator("details").filter(has_text="Missions SAR").locator("summary").click()
        page.wait_for_timeout(300)
        multi_none = eval_state(page)
        print("MULTI NO SELECT:", json.dumps(multi_none, indent=2, ensure_ascii=False))

        page.select_option("#sarMissionSelect", "m2")
        page.wait_for_timeout(300)
        page.evaluate(
            """() => {
          const cb = document.getElementById('sarModeCheckbox');
          if (cb && !cb.checked) cb.click();
        }"""
        )
        page.wait_for_timeout(300)
        multi_active = eval_state(page)
        print("MULTI AFTER SELECT+CHECK:", json.dumps(multi_active, indent=2, ensure_ascii=False))

        if errors:
            print("PAGE ERRORS:", errors, file=sys.stderr)

        browser.close()

    ok = (
        after_check.get("cbChecked") is True
        and after_check.get("sarModeActive") is True
        and after_check.get("toolsVisible") is True
        and after_reload.get("sarModeActive") is True
        and multi_none.get("cbDisabled") is True
        and multi_none.get("selectValue") == ""
        and multi_active.get("cbChecked") is True
        and multi_active.get("toolsVisible") is True
        and multi_active.get("activeMissionId") == "m2"
    )
    return ok


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
