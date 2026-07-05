#!/usr/bin/env python3
"""Relevé DF : le point de relevé doit être à la position du clic, pas à la station."""

import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def dist_deg(a_lat, a_lon, b_lat, b_lon):
    return math.hypot(a_lat - b_lat, a_lon - b_lon)


def test_releve_on_station_marker_uses_click_not_anchor():
    """Clic droit sur marqueur station : relevé au clic, pas à l'ancre station."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: d.accept())
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")

        page.locator("summary", has_text="Missions SAR").click()
        page.fill("#sarNewMissionName", "Station marker click")
        page.select_option("#sarNewMissionType", "aeronef")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(500)
        page.locator("#sarModeCheckbox").check()
        page.wait_for_timeout(300)

        # Placer Alpha via UI pour avoir un marqueur visible au centre carte
        page.locator(".sar-team-row", has_text="Alpha").locator(".sar-team-place-btn").click()
        box = page.locator("#map").bounding_box()
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.5
        page.mouse.click(cx, cy)
        page.wait_for_timeout(400)
        page.click("#sarPanelSave")
        page.wait_for_timeout(500)

        station_ll = page.evaluate(
            """() => {
              const s = CartoffSar.getStore();
              const m = s.missions.find(x => x.id === s.activeMissionId);
              const st = (m.features || []).find(
                f => (f.properties || {})['sar:team_name'] === 'Alpha'
                  || ((f.properties || {}).label === 'Alpha')
              );
              const c = st && st.geometry && st.geometry.coordinates;
              return c ? { lat: c[1], lon: c[0] } : null;
            }"""
        )

        # Clic droit sur le marqueur station (centre carte) avec léger décalage pixel
        page.mouse.click(cx + 2, cy + 2, button="right")
        page.wait_for_timeout(400)

        click_ll = page.evaluate(
            """() => {
              const ll = window.getLastRightClickLatLng && window.getLastRightClickLatLng();
              return ll ? { lat: ll.lat, lng: ll.lng } : null;
            }"""
        )
        target_info = page.evaluate(
            """() => {
              const t = window.getMapContextMenuClickTarget && window.getMapContextMenuClickTarget();
              if (!t) return null;
              return {
                hasClickLatlng: !!t.clickLatlng,
                anchor: t.latlng ? { lat: t.latlng.lat, lng: t.latlng.lng } : null,
                click: t.clickLatlng ? { lat: t.clickLatlng.lat, lng: t.clickLatlng.lng } : null
              };
            }"""
        )

        page.evaluate(
            """() => {
              const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
                .find(b => /^Relevé DF$/i.test(b.textContent.trim()));
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(500)

        page.click("#sarPanelSave")
        page.wait_for_timeout(500)

        saved = page.evaluate(
            """() => {
              const s = CartoffSar.getStore();
              const m = s.missions.find(x => x.id === s.activeMissionId);
              const rp = (m.features || []).find(f => (f.properties || {})['sar:role'] === 'releve_point');
              return rp && rp.geometry && rp.geometry.coordinates;
            }"""
        )
        browser.close()

    if not click_ll or not station_ll or not saved:
        print("FAIL station marker: données manquantes", click_ll, station_ll, saved)
        return False

    rp_lon, rp_lat = saved
    click_lat, click_lon = click_ll["lat"], click_ll["lng"]
    st_lat, st_lon = station_ll["lat"], station_ll["lon"]

    # Le clic sur marqueur peut être très proche de la station ; relevé doit suivre le clic
    dist_to_click = dist_deg(rp_lat, rp_lon, click_lat, click_lon)
    dist_to_station = dist_deg(rp_lat, rp_lon, st_lat, st_lon)

    print("STATION MARKER:", json.dumps({
        "target": target_info,
        "click_ll": click_ll,
        "station_ll": station_ll,
        "saved": saved,
        "dist_click": dist_to_click,
        "dist_station": dist_to_station,
    }, indent=2, ensure_ascii=False))

    ok = dist_to_click < 0.0002 and target_info and target_info.get("hasClickLatlng")
    if ok:
        print("OK relevé sur marqueur station suit le clic")
    else:
        print("FAIL relevé sur marqueur station")
    return ok


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("dialog", lambda d: d.accept())
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.removeItem('cartoff_sar_missions')")
        page.reload(wait_until="networkidle")

        page.locator("summary", has_text="Missions SAR").click()
        page.fill("#sarNewMissionName", "Click position test")
        page.select_option("#sarNewMissionType", "aeronef")
        page.click("#sarCreateMissionBtn")
        page.wait_for_timeout(500)
        page.locator("#sarModeCheckbox").check()
        page.wait_for_timeout(300)

        box = page.locator("#map").bounding_box()
        # Clic droit décalé du centre carte (évite le marqueur station au centre par défaut)
        cx = box["x"] + box["width"] * 0.62
        cy = box["y"] + box["height"] * 0.38
        page.mouse.click(cx, cy, button="right")
        page.wait_for_timeout(400)

        click_ll = page.evaluate(
            """() => {
              const ll = window.getLastRightClickLatLng && window.getLastRightClickLatLng();
              return ll ? { lat: ll.lat, lng: ll.lng } : null;
            }"""
        )
        station_ll = page.evaluate(
            """() => {
              const s = CartoffSar.getStore();
              const m = s.missions.find(x => x.id === s.activeMissionId);
              const st = (m.features || []).find(
                f => (f.properties || {})['sar:role'] === 'station_df'
              );
              const c = st && st.geometry && st.geometry.coordinates;
              return c ? { lat: c[1], lon: c[0] } : null;
            }"""
        )

        page.evaluate(
            """() => {
              const btn = Array.from(document.querySelectorAll('#mapContextMenu button'))
                .find(b => /^Relevé DF$/i.test(b.textContent.trim()));
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(500)

        # 3 stations par défaut → sélecteur ; choisir Alpha
        picker = page.locator("#sarBearingStationPicker button").first
        if picker.count() > 0:
            picker.click()
            page.wait_for_timeout(400)

        panel_open = page.evaluate("""() => !document.getElementById('sarPanel').hidden""")
        if not panel_open:
            browser.close()
            print("FAIL: panneau relevé non ouvert")
            return False

        panel_coords = page.evaluate(
            """() => {
              const el = document.getElementById('sarPanelBearingTarget');
              if (!el || el.hidden) return { ok: false, reason: 'no bearing target el' };
              const text = el.textContent || '';
              const m = text.match(/Lat\\/Lon\\s*:\\s*([-\\d.]+)\\s*,\\s*([-\\d.]+)/);
              if (!m) return { ok: false, reason: 'no coords in panel', text };
              return { ok: true, lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
            }"""
        )

        page.click("#sarPanelSave")
        page.wait_for_timeout(500)

        saved = page.evaluate(
            """() => {
              const s = CartoffSar.getStore();
              const m = s.missions.find(x => x.id === s.activeMissionId);
              const feats = m.features || [];
              const rp = feats.find(f => (f.properties || {})['sar:role'] === 'releve_point');
              return rp && rp.geometry && rp.geometry.coordinates;
            }"""
        )
        browser.close()

    result = {
        "click_ll": click_ll,
        "station_ll": station_ll,
        "panel_coords": panel_coords,
        "saved_releve": saved,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

    if not click_ll or not station_ll or not saved or not panel_coords.get("ok"):
        print("FAIL: données manquantes")
        return False

    rp_lon, rp_lat = saved
    click_lat, click_lon = click_ll["lat"], click_ll["lng"]
    st_lat, st_lon = station_ll["lat"], station_ll["lon"]
    panel_lat, panel_lon = panel_coords["lat"], panel_coords["lon"]

    dist_to_click = dist_deg(rp_lat, rp_lon, click_lat, click_lon)
    dist_to_station = dist_deg(rp_lat, rp_lon, st_lat, st_lon)
    panel_dist_click = dist_deg(panel_lat, panel_lon, click_lat, click_lon)
    panel_dist_station = dist_deg(panel_lat, panel_lon, st_lat, st_lon)

    # Clic carte et station SDIS42 doivent être distincts
    if dist_deg(click_lat, click_lon, st_lat, st_lon) < 0.001:
        print("SKIP: clic tombe sur la station (recentrer le test)")
        return True

    ok = (
        dist_to_click < 0.0001
        and dist_to_station > 0.001
        and panel_dist_click < 0.0001
        and panel_dist_station > 0.001
    )
    if ok:
        print("OK relevé au clic, pas à la station")
    else:
        print(
            "FAIL: releve=(%.5f,%.5f) click=(%.5f,%.5f) station=(%.5f,%.5f)"
            % (rp_lat, rp_lon, click_lat, click_lon, st_lat, st_lon)
        )
    return ok


if __name__ == "__main__":
    try:
        ok_map = main()
        ok_marker = test_releve_on_station_marker_uses_click_not_anchor()
    except Exception as e:
        print("ERROR:", repr(e))
        sys.exit(1)
    sys.exit(0 if ok_map and ok_marker else 1)
