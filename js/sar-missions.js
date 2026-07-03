/* Missions SAR — gestion, saisie terrain, persistance localStorage (voir sources.md) */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'cartoff_sar_missions';
  const LAYER_NAME = 'Missions SAR';
  const T = global.CartoffSarTypes;

  let map = null;
  let layersRef = null;
  let updateLegendFn = null;
  let findCommuneFn = null;
  let latLngToDfciFn = null;
  let latLngToUtmFn = null;

  let sidebarEl = null;
  let panelEl = null;
  let panelTitleEl = null;
  let panelLabelEl = null;
  let panelNotesEl = null;
  let panelSaveBtn = null;
  let panelCancelBtn = null;
  let panelDeleteBtn = null;
  let panelDfFieldsEl = null;
  let panelTimestampEl = null;
  let panelBearingFieldsEl = null;
  let panelAzimuthEl = null;
  let panelRangeEl = null;
  let drawBannerEl = null;
  let drawBannerTextEl = null;
  let drawFinishBtn = null;
  let drawCancelBtn = null;

  let store = { version: 1, activeMissionId: null, missions: [] };
  let sarModeActive = false;
  let layerVisible = false;
  let panelState = null;
  let drawState = null;
  let pendingPointRole = null;
  let pendingBearingPick = false;
  let bearingPreviewLayer = null;
  const iconCache = {};
  let legendEntries = [];
  const FIX_ROLES = new Set(['fixe_estime', 'incertitude_fix']);

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'sar-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.missions)) {
        store = {
          version: data.version || 1,
          activeMissionId: data.activeMissionId || null,
          missions: data.missions
        };
      }
    } catch (err) {
      console.warn('Missions SAR : stockage invalide', err);
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function getMission(id) {
    return store.missions.find((m) => m.id === id) || null;
  }

  function getActiveMission() {
    if (!store.activeMissionId) return null;
    return getMission(store.activeMissionId);
  }

  function missionCanEdit(mission) {
    return !!(mission && mission.status === 'active');
  }

  function activeMissionFeatures() {
    const mission = getActiveMission();
    if (!mission || !Array.isArray(mission.features)) return [];
    return mission.features;
  }

  function allFeatures() {
    const out = [];
    store.missions.forEach((m) => {
      (m.features || []).forEach((f) => out.push(f));
    });
    return out;
  }

  function featuresForDisplay() {
    const mission = getActiveMission();
    if (!mission) return [];
    const features = mission.features || [];
    ensureVisibleFixIds(mission);
    return features.filter((f) => {
      const p = f.properties || {};
      const role = p[T.PROP_ROLE];
      if (!FIX_ROLES.has(role)) return true;
      const fixId = role === 'fixe_estime' ? p.id : p[T.PROP_FIX_STATION_IDS];
      return isFixVisible(mission, fixId);
    });
  }

  function ensureVisibleFixIds(mission) {
    if (!mission) return;
    const fixIds = getEstimatedFixFeatures(mission).map((f) => f.properties.id);
    if (!Array.isArray(mission.visibleFixIds)) {
      mission.visibleFixIds = fixIds.slice();
      return;
    }
    const visible = mission.visibleFixIds.filter((id) => fixIds.includes(id));
    fixIds.forEach((id) => {
      if (!visible.includes(id)) visible.push(id);
    });
    if (visible.length !== mission.visibleFixIds.length ||
        visible.some((id, i) => id !== mission.visibleFixIds[i])) {
      mission.visibleFixIds = visible;
    }
  }

  function isFixVisible(mission, fixId) {
    if (!mission || !fixId) return false;
    ensureVisibleFixIds(mission);
    return mission.visibleFixIds.includes(fixId);
  }

  function setFixVisibility(mission, fixId, visible) {
    if (!mission || !fixId) return;
    ensureVisibleFixIds(mission);
    const has = mission.visibleFixIds.includes(fixId);
    if (visible && !has) mission.visibleFixIds.push(fixId);
    else if (!visible && has) {
      mission.visibleFixIds = mission.visibleFixIds.filter((id) => id !== fixId);
    }
    saveStore();
    rebuildLayer();
  }

  function setAllFixesVisibility(mission, visible) {
    if (!mission) return;
    const fixIds = getEstimatedFixFeatures(mission).map((f) => f.properties.id);
    mission.visibleFixIds = visible ? fixIds.slice() : [];
    saveStore();
    rebuildLayer();
  }

  function formatFixStationPair(mission, fixProps, receptions) {
    const usedIds = (fixProps[T.PROP_FIX_STATION_IDS] || '').split(',').filter(Boolean);
    return usedIds.map((sid) => {
      const st = findStationById(mission, sid);
      const stLabel = st && st.properties ? (st.properties.label || sid) : sid;
      const rec = receptions.find((r) => r.stationId === sid);
      const az = rec ? rec.azimuth + '°' : '—';
      return escapeHtml(stLabel) + ' ' + escapeHtml(String(az));
    }).join(' / ');
  }

  function findFeature(featureId) {
    for (let i = 0; i < store.missions.length; i++) {
      const m = store.missions[i];
      const f = (m.features || []).find((feat) => feat.properties && feat.properties.id === featureId);
      if (f) return { mission: m, feature: f };
    }
    return null;
  }

  function missionStatusLabel(status) {
    return status === 'closed' ? 'Clôturée' : 'Active';
  }

  function clampPopupPosition(el, clientX, clientY, margin) {
    const m = margin || 8;
    const rect = el.getBoundingClientRect();
    const w = rect.width || el.offsetWidth || 200;
    const h = rect.height || el.offsetHeight || 120;
    let x = clientX;
    let y = clientY;
    if (x + w + m > window.innerWidth) x = window.innerWidth - w - m;
    if (y + h + m > window.innerHeight) y = window.innerHeight - h - m;
    if (x < m) x = m;
    if (y < m) y = m;
    return { x, y };
  }

  function isFixFeature(props) {
    return props && FIX_ROLES.has(props[T.PROP_ROLE]);
  }

  function removeEstimatedFix(mission) {
    if (!mission || !mission.features) return;
    const len = mission.features.length;
    mission.features = mission.features.filter((f) => {
      const p = f.properties || {};
      return !FIX_ROLES.has(p[T.PROP_ROLE]);
    });
    if (mission.features.length !== len) {
      mission.visibleFixIds = [];
      saveStore();
    }
  }

  function getEstimatedFixFeature(mission) {
    const fixes = getEstimatedFixFeatures(mission);
    if (!fixes.length) return null;
    const best = fixes.find((f) => f.properties && f.properties[T.PROP_FIX_IS_BEST] === true);
    return best || fixes[0];
  }

  function getEstimatedFixFeatures(mission) {
    return (mission && mission.features || []).filter((f) => {
      const p = f.properties || {};
      return p[T.PROP_ROLE] === 'fixe_estime';
    }).sort((a, b) => {
      const ia = (a.properties && a.properties[T.PROP_FIX_INDEX]) || 999;
      const ib = (b.properties && b.properties[T.PROP_FIX_INDEX]) || 999;
      return ia - ib;
    });
  }

  function hasEstimatedFix(mission) {
    return getEstimatedFixFeatures(mission).length > 0;
  }

  function receptionBearings(mission) {
    const out = [];
    (mission && mission.features || []).forEach((f) => {
      const p = f.properties || {};
      if (p[T.PROP_ROLE] !== 'relevement_df') return;
      if (p[T.PROP_BEARING_RECIPROCAL] === true) return;
      const stationId = p[T.PROP_STATION_ID];
      if (!stationId) return;
      const station = findStationById(mission, stationId);
      if (!station || !station.geometry || !station.geometry.coordinates) return;
      const c = station.geometry.coordinates;
      out.push({
        stationId,
        groupId: p[T.PROP_BEARING_GROUP_ID] || null,
        azimuth: p[T.PROP_AZIMUTH],
        stationLat: c[1],
        stationLon: c[0],
        stationLabel: (station.properties && station.properties.label) || 'Station DF'
      });
    });
    return out;
  }

  function formatCoordsLines(lat, lon) {
    const lines = [];
    lines.push('Lat/Lon : ' + lat.toFixed(6) + ', ' + lon.toFixed(6));
    if (latLngToUtmFn) {
      try {
        const utm = latLngToUtmFn(lat, lon);
        if (utm) {
          lines.push('UTM : ' + utm.zone + utm.hemisphere + ' E ' + utm.easting + ' N ' + utm.northing);
        }
      } catch (e) { /* ignore */ }
    }
    if (latLngToDfciFn) {
      try {
        const dfci = latLngToDfciFn(lat, lon);
        if (dfci && dfci.base) lines.push('DFCI : ' + dfci.base);
      } catch (e) { /* ignore */ }
    }
    return lines;
  }

  function buildEstimatedFixFeatures(mission, intersectionResult, uncertaintyKm) {
    const ts = new Date().toISOString();
    const unc = Math.max(0.1, Number(uncertaintyKm) || T.DEFAULT_UNCERTAINTY_KM);
    const candidates = (intersectionResult && intersectionResult.candidates) || [];
    const features = [];

    candidates.forEach((result) => {
      const fixId = newId();
      const uncId = newId();
      const stationIds = result.stations.map((s) => s.stationId);
      const fixIndex = result.index || 1;
      const color = result.color || T.FIX_COLOR_PALETTE[0];
      const isBest = !!result.isBest;
      const fixLabel = 'Fix ' + fixIndex + (isBest ? ' (meilleur)' : '');

      const fixProps = T.buildFeatureProps(mission, 'fixe_estime', {
        id: fixId,
        label: fixLabel,
        notes: 'Intersection de relèvements DF (SAR-3)',
        created_at: ts,
        [T.PROP_QUALITY_ANGLE]: result.qualityAngle,
        [T.PROP_UNCERTAINTY_KM]: unc,
        [T.PROP_FIX_STATION_IDS]: stationIds.join(','),
        [T.PROP_FIX_INDEX]: fixIndex,
        [T.PROP_FIX_IS_BEST]: isBest,
        [T.PROP_FIX_COLOR]: color
      });
      enrichLocationProps(fixProps, result.lat, result.lon);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [result.lon, result.lat] },
        properties: fixProps
      });

      const uncProps = T.buildFeatureProps(mission, 'incertitude_fix', {
        id: uncId,
        label: 'Incertitude Fix ' + fixIndex + ' ±' + unc + ' km',
        notes: '',
        created_at: ts,
        [T.PROP_UNCERTAINTY_KM]: unc,
        [T.PROP_FIX_STATION_IDS]: fixId,
        [T.PROP_FIX_INDEX]: fixIndex,
        [T.PROP_FIX_COLOR]: color
      });
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: T.circlePolygonCoordinates(result.lat, result.lon, unc)
        },
        properties: uncProps
      });
    });

    return {
      features,
      candidates,
      best: intersectionResult && intersectionResult.best
    };
  }

  function computeAndApplyIntersection(mission, options) {
    if (!mission || mission.type !== 'aeronef') return { ok: false, reason: 'wrong_type' };
    const opts = options || {};
    const receptions = receptionBearings(mission);
    removeEstimatedFix(mission);
    if (receptions.length < 2) {
      if (opts.rebuild !== false) rebuildLayer();
      if (opts.renderSidebar !== false) renderSidebar();
      return { ok: false, reason: 'need_two_bearings' };
    }
    const intersectionResult = T.computeAllIntersections(receptions);
    const nCand = (intersectionResult.candidates || []).length;
    const nPairs = (receptions.length * (receptions.length - 1)) / 2;
    console.log(
      '[SAR-3] Intersections :',
      nCand + '/' + nPairs + ' paire(s) valide(s)',
      'depuis',
      receptions.length,
      'relèvement(s) réception',
      nCand ? intersectionResult.candidates.map((c) => {
        const ids = c.stations.map((s) => s.stationId).join('+');
        return ids + '@' + c.lat.toFixed(5) + ',' + c.lon.toFixed(5);
      }) : '(aucun — parallèles, angle < 15° ou hors azimut)'
    );
    if (!intersectionResult.best) {
      if (opts.rebuild !== false) rebuildLayer();
      if (opts.renderSidebar !== false) renderSidebar();
      return { ok: false, reason: 'no_intersection' };
    }
    const uncKm = opts.uncertaintyKm != null ? opts.uncertaintyKm : T.DEFAULT_UNCERTAINTY_KM;
    const built = buildEstimatedFixFeatures(mission, intersectionResult, uncKm);
    if (!mission.features) mission.features = [];
    built.features.forEach((f) => mission.features.push(f));
    mission.visibleFixIds = getEstimatedFixFeatures(mission).map((f) => f.properties.id);
    saveStore();
    if (opts.rebuild !== false) rebuildLayer();
    if (opts.renderSidebar !== false) renderSidebar();
    return { ok: true, result: intersectionResult, built };
  }

  function maybeAutoUpdateIntersection(mission) {
    if (!mission || mission.type !== 'aeronef') return;
    const receptions = receptionBearings(mission);
    if (receptions.length < 2) {
      removeEstimatedFix(mission);
      rebuildLayer();
      renderSidebar();
      return;
    }
    const prev = getEstimatedFixFeature(mission);
    let uncKm = T.DEFAULT_UNCERTAINTY_KM;
    if (prev && prev.properties && prev.properties[T.PROP_UNCERTAINTY_KM] != null) {
      uncKm = prev.properties[T.PROP_UNCERTAINTY_KM];
    }
    computeAndApplyIntersection(mission, { uncertaintyKm: uncKm, renderSidebar: false });
    renderSidebar();
  }

  function getRoleFromProps(props) {
    if (!props) return null;
    return T.getRole(props[T.PROP_ROLE]);
  }

  function isMissionClosed(mission) {
    return !!(mission && mission.status === 'closed');
  }

  function getMarkerIcon(roleId, closed, props) {
    const role = T.getRole(roleId);
    if (!role || role.geometry !== 'point') return null;
    if (roleId === 'fixe_estime') {
      const color = (props && props[T.PROP_FIX_COLOR]) || '#c62828';
      const fixIndex = (props && props[T.PROP_FIX_INDEX]) || '';
      const isBest = props && props[T.PROP_FIX_IS_BEST] === true;
      const key = roleId + '|' + color + '|' + fixIndex + '|' + (isBest ? 'b' : '') + (closed ? '|closed' : '');
      if (!iconCache[key]) {
        const markerText = isBest ? '★' : (fixIndex ? String(fixIndex) : '+');
        const size = isBest ? 28 : 26;
        const anchor = size / 2;
        const extraClass = isBest ? ' sar-marker-fixe-best' : '';
        iconCache[key] = L.divIcon({
          className: role.markerClass + ' sar-marker' + extraClass + (closed ? ' sar-marker-closed' : ''),
          html: '<div style="color:' + color + ';">' + markerText + '</div>',
          iconSize: [size, size],
          iconAnchor: [anchor, anchor],
          popupAnchor: [0, -anchor]
        });
      }
      return iconCache[key];
    }
    const key = roleId + (closed ? '|closed' : '');
    if (!iconCache[key]) {
      iconCache[key] = L.divIcon({
        className: role.markerClass + ' sar-marker' + (closed ? ' sar-marker-closed' : ''),
        html: role.markerHtml,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -11]
      });
    }
    return iconCache[key];
  }

  function getLineStyle(roleId, closed, props) {
    const role = T.getRole(roleId);
    let base;
    if (roleId === 'relevement_df' && props && props[T.PROP_BEARING_RECIPROCAL] === true) {
      base = (role && role.lineStyleReciprocal) || { color: '#e65100', weight: 2, dashArray: '8 6', opacity: 0.75 };
    } else if (role && role.lineStyle) {
      base = role.lineStyle;
    } else if (roleId === 'trace_fouille') {
      base = { color: '#2e7d32', weight: 4, dashArray: '10 6' };
    } else {
      base = { color: '#333', weight: 3 };
    }
    const opacity = closed ? 0.45 : (base.opacity != null ? base.opacity : 1);
    return { ...base, opacity };
  }

  function getPolygonStyle(roleId, closed, props) {
    const role = T.getRole(roleId);
    let base = (role && role.polygonStyle) || { color: '#333', weight: 2, fillColor: '#999', fillOpacity: 0.3 };
    if (roleId === 'incertitude_fix' && props && props[T.PROP_FIX_COLOR]) {
      const color = props[T.PROP_FIX_COLOR];
      base = { color, weight: 1, fillColor: color, fillOpacity: 0.12, dashArray: '4 4' };
    }
    return {
      ...base,
      opacity: closed ? 0.45 : 1,
      fillOpacity: closed ? (base.fillOpacity || 0.3) * 0.45 : (base.fillOpacity || 0.3)
    };
  }

  function buildPopupContent(props, mission) {
    const role = getRoleFromProps(props);
    const roleLabel = role ? role.label : (props[T.PROP_ROLE] || 'Élément SAR');
    const label = props.label || roleLabel;
    let html = '<b>' + escapeHtml(label) + '</b><br>';
    html += '<b>Rôle :</b> ' + escapeHtml(roleLabel) + '<br>';
    if (mission) {
      html += '<b>Mission :</b> ' + escapeHtml(mission.name) + '<br>';
      html += '<b>Statut mission :</b> ' + missionStatusLabel(mission.status) + '<br>';
    }
    if (props.created_at) {
      html += '<b>Horodatage :</b> ' + escapeHtml(formatTimestamp(props.created_at)) + '<br>';
    }
    if (props.notes) html += '<b>Notes :</b> ' + escapeHtml(props.notes) + '<br>';
    if (props.commune) html += '<b>Commune :</b> ' + escapeHtml(props.commune) + '<br>';
    if (props.dfci) html += '<b>DFCI :</b> ' + escapeHtml(props.dfci) + '<br>';
    if (props[T.PROP_AZIMUTH] != null) {
      html += '<b>Azimut :</b> ' + escapeHtml(String(props[T.PROP_AZIMUTH])) + '°<br>';
    }
    if (props[T.PROP_RANGE_KM] != null) {
      html += '<b>Portée :</b> ' + escapeHtml(String(props[T.PROP_RANGE_KM])) + ' km<br>';
    }
    if (props[T.PROP_BEARING_RECIPROCAL] === true) {
      html += '<i>Ligne réciproque</i><br>';
    } else if (props[T.PROP_BEARING_RECIPROCAL] === false) {
      html += '<i>Ligne réception</i><br>';
    }
    if (props[T.PROP_QUALITY_ANGLE] != null) {
      html += '<b>Angle de coupe :</b> ' + escapeHtml(String(props[T.PROP_QUALITY_ANGLE])) + '°';
      html += ' (' + escapeHtml(T.qualityLabel(props[T.PROP_QUALITY_ANGLE])) + ')<br>';
    }
    if (props[T.PROP_FIX_INDEX] != null) {
      html += '<b>Candidat :</b> Fix ' + escapeHtml(String(props[T.PROP_FIX_INDEX]));
      if (props[T.PROP_FIX_IS_BEST] === true) html += ' <b>(meilleur)</b>';
      html += '<br>';
    }
    if (props[T.PROP_UNCERTAINTY_KM] != null && props[T.PROP_ROLE] === 'fixe_estime') {
      html += '<b>Incertitude :</b> ± ' + escapeHtml(String(props[T.PROP_UNCERTAINTY_KM])) + ' km<br>';
    }
    return html;
  }

  function parseDatetimeLocal(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function toDatetimeLocalValue(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) {
      return '';
    }
  }

  function stationFeatures(mission) {
    return (mission && mission.features || []).filter((f) => {
      const p = f.properties || {};
      return p[T.PROP_ROLE] === 'station_df' && f.geometry && f.geometry.type === 'Point';
    });
  }

  function findStationById(mission, stationId) {
    return stationFeatures(mission).find((f) => f.properties && f.properties.id === stationId) || null;
  }

  function featuresInBearingGroup(mission, groupId) {
    return (mission && mission.features || []).filter((f) => {
      const p = f.properties || {};
      return p[T.PROP_BEARING_GROUP_ID] === groupId;
    });
  }

  function isBearingFeature(props) {
    return props && props[T.PROP_ROLE] === 'relevement_df';
  }

  function bearingGroupIdFromProps(props) {
    return props && props[T.PROP_BEARING_GROUP_ID] || null;
  }

  function setPanelFieldVisibility(roleId, panelKind) {
    const isStation = roleId === 'station_df' || panelKind === 'station';
    const isBearing = roleId === 'relevement_df' || panelKind === 'bearing';
    if (panelDfFieldsEl) panelDfFieldsEl.hidden = !isStation;
    if (panelBearingFieldsEl) panelBearingFieldsEl.hidden = !isBearing;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTimestamp(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
      return iso;
    }
  }

  function enrichLocationProps(props, lat, lon) {
    if (findCommuneFn) {
      const commune = findCommuneFn(lat, lon);
      if (commune) props.commune = commune;
    }
    if (latLngToDfciFn) {
      const dfci = latLngToDfciFn(lat, lon);
      if (dfci && dfci.base) props.dfci = dfci.base;
    }
    return props;
  }

  function bindFeatureContextMenu(layer, feature, mission) {
    const showMenu = (domEvent, clickLatLng) => {
      L.DomEvent.stop(domEvent);
      const geom = feature.geometry || {};
      const isLine = geom.type === 'LineString';
      const isPolygon = geom.type === 'Polygon';
      let latlng = clickLatLng || (layer.getLatLng ? layer.getLatLng() : null);
      if (!latlng && geom.type === 'Point' && geom.coordinates) {
        latlng = L.latLng(geom.coordinates[1], geom.coordinates[0]);
      }
      if (!latlng && isLine && geom.coordinates && geom.coordinates.length) {
        const c = geom.coordinates[0];
        latlng = L.latLng(c[1], c[0]);
      }
      if (!latlng && isPolygon && geom.coordinates && geom.coordinates[0] && geom.coordinates[0].length) {
        const ring = geom.coordinates[0].map((c) => L.latLng(c[1], c[0]));
        latlng = L.polygon(ring).getBounds().getCenter();
      }
      openFeatureContextMenu(domEvent.clientX, domEvent.clientY, feature, mission, latlng);
    };
    layer.on('contextmenu', (e) => {
      if (e.originalEvent) showMenu(e.originalEvent, e.latlng);
    });
    layer.on('add', () => {
      if (layer._icon) L.DomEvent.on(layer._icon, 'contextmenu', showMenu);
      if (layer._path) L.DomEvent.on(layer._path, 'contextmenu', showMenu);
    });
    layer.on('remove', () => {
      if (layer._icon) L.DomEvent.off(layer._icon, 'contextmenu', showMenu);
      if (layer._path) L.DomEvent.off(layer._path, 'contextmenu', showMenu);
    });
    if (layer._icon) L.DomEvent.on(layer._icon, 'contextmenu', showMenu);
    if (layer._path) L.DomEvent.on(layer._path, 'contextmenu', showMenu);
  }

  function buildLayerFromFeatures(features, mission) {
    const group = L.layerGroup([], { pane: 'sarPane' });
    const closed = isMissionClosed(mission);

    (features || []).forEach((feature) => {
      const props = feature.properties || {};
      const geom = feature.geometry;
      if (!geom) return;
      const roleId = props[T.PROP_ROLE];

      if (geom.type === 'Point' && geom.coordinates) {
        const latlng = L.latLng(geom.coordinates[1], geom.coordinates[0]);
        const marker = L.marker(latlng, {
          icon: getMarkerIcon(roleId, closed, props),
          pane: 'sarPane'
        });
        marker._cartoffSarFeature = feature;
        marker.bindPopup(buildPopupContent(props, mission));
        bindFeatureContextMenu(marker, feature, mission);
        group.addLayer(marker);
      } else if (geom.type === 'LineString' && geom.coordinates && geom.coordinates.length >= 2) {
        const latlngs = geom.coordinates.map((c) => L.latLng(c[1], c[0]));
        const polyline = L.polyline(latlngs, {
          ...getLineStyle(roleId, closed, props),
          pane: 'sarPane'
        });
        polyline._cartoffSarFeature = feature;
        polyline.bindPopup(buildPopupContent(props, mission));
        bindFeatureContextMenu(polyline, feature, mission);
        group.addLayer(polyline);
      } else if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0] && geom.coordinates[0].length >= 3) {
        const latlngs = geom.coordinates[0].map((c) => L.latLng(c[1], c[0]));
        const polygon = L.polygon(latlngs, {
          ...getPolygonStyle(roleId, closed, props),
          pane: 'sarPane'
        });
        polygon._cartoffSarFeature = feature;
        polygon.bindPopup(buildPopupContent(props, mission));
        bindFeatureContextMenu(polygon, feature, mission);
        group.addLayer(polygon);
      }
    });

    getEstimatedFixFeatures(mission).forEach((fixFeature) => {
      addFixLiaisonLines(group, fixFeature, mission, closed);
    });

    group._cartoffSarMissionId = mission ? mission.id : null;
    return group;
  }

  function addFixLiaisonLines(group, fixFeature, mission, closed) {
    const props = fixFeature.properties || {};
    const fixId = props.id;
    if (!isFixVisible(mission, fixId)) return;
    const color = props[T.PROP_FIX_COLOR] || '#c62828';
    const coords = fixFeature.geometry && fixFeature.geometry.coordinates;
    if (!coords) return;
    const fixLatLng = L.latLng(coords[1], coords[0]);
    const stationIds = (props[T.PROP_FIX_STATION_IDS] || '').split(',').filter(Boolean);
    stationIds.forEach((sid) => {
      const st = findStationById(mission, sid);
      if (!st || !st.geometry || !st.geometry.coordinates) return;
      const sc = st.geometry.coordinates;
      const stLatLng = L.latLng(sc[1], sc[0]);
      const line = L.polyline([stLatLng, fixLatLng], {
        color,
        weight: 1,
        dashArray: '4 6',
        opacity: closed ? 0.25 : 0.45,
        pane: 'sarPane'
      });
      group.addLayer(line);
    });
  }

  function collectLegendEntries(features) {
    const seen = new Map();
    (features || []).forEach((feature) => {
      const props = feature.properties || {};
      const role = getRoleFromProps(props);
      if (!role) return;
      if (!seen.has(role.id)) {
        seen.set(role.id, { role, label: role.label });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }

  function rebuildLayer() {
    const mission = getActiveMission();
    const checkbox = document.getElementById('sarLayerCheckbox');
    const wasVisible = layerVisible && map && layersRef && layersRef[LAYER_NAME] && map.hasLayer(layersRef[LAYER_NAME]);

    if (!mission) {
      legendEntries = [];
      if (layersRef && layersRef[LAYER_NAME] && map) {
        if (map.hasLayer(layersRef[LAYER_NAME])) map.removeLayer(layersRef[LAYER_NAME]);
        delete layersRef[LAYER_NAME];
      }
      if (updateLegendFn) updateLegendFn();
      return;
    }

    const oldLayer = layersRef && layersRef[LAYER_NAME];
    if (oldLayer && map) {
      if (map.hasLayer(oldLayer)) map.removeLayer(oldLayer);
    }

    const features = featuresForDisplay();
    legendEntries = collectLegendEntries(features);
    const newLayer = buildLayerFromFeatures(features, mission);
    if (layersRef) layersRef[LAYER_NAME] = newLayer;

    const shouldShow = wasVisible || (checkbox && checkbox.checked);
    if (shouldShow && map) {
      newLayer.addTo(map);
      layerVisible = true;
      if (checkbox) checkbox.checked = true;
    }
    if (updateLegendFn) updateLegendFn();
  }

  function renderSidebar() {
    if (!sidebarEl) return;
    const mission = getActiveMission();
    const canEdit = missionCanEdit(mission);

    let html = '<p class="situation-hint" id="sarHint">';
    if (!mission) {
      html += 'Créez une mission puis activez le mode SAR pour saisir des éléments.';
    } else if (!canEdit) {
      html += 'Mission clôturée — consultation uniquement. Réactivez la mission pour modifier.';
    } else if (sarModeActive) {
      if (mission && mission.type === 'aeronef') {
        html += 'Mode SAR actif : station DF, relèvements (clic droit ou outils ci-dessous).';
      } else {
        html += 'Mode SAR actif : clic droit sur la carte ou outils ci-dessous.';
      }
    } else if (mission && mission.type === 'aeronef') {
      html += 'Cochez « Mode SAR » pour placer des stations DF et des relèvements.';
    } else {
      html += 'Cochez « Mode SAR » pour saisir LKP, indices, tracés…';
    }
    html += '</p>';

    html += '<div class="sar-mission-form">';
    html += '<label>Nouvelle mission<input type="text" id="sarNewMissionName" placeholder="Nom de la mission…" maxlength="80"></label>';
    html += '<label>Type<select id="sarNewMissionType">';
    Object.keys(T.MISSION_TYPES).forEach((id) => {
      const mt = T.MISSION_TYPES[id];
      const disabled = mt.enabled ? '' : ' disabled';
      const hint = mt.hint ? ' (' + mt.hint + ')' : '';
      html += '<option value="' + id + '"' + disabled + '>' + mt.label + hint + '</option>';
    });
    html += '</select></label>';
    html += '<button type="button" id="sarCreateMissionBtn" class="situation-btn situation-btn-primary">Créer mission</button>';
    html += '</div>';

    html += '<div class="sar-mission-list-wrap">';
    html += '<label for="sarMissionSelect">Mission active</label>';
    html += '<select id="sarMissionSelect">';
    if (!store.missions.length) {
      html += '<option value="">— Aucune mission —</option>';
    } else {
      store.missions.forEach((m) => {
        const sel = m.id === store.activeMissionId ? ' selected' : '';
        const status = missionStatusLabel(m.status);
        html += '<option value="' + m.id + '"' + sel + '>' + escapeHtml(m.name) + ' (' + status + ')</option>';
      });
    }
    html += '</select>';
    html += '<div class="sar-mission-actions">';
    if (mission) {
      if (canEdit) {
        html += '<button type="button" id="sarCloseMissionBtn" class="situation-btn">Clôturer</button>';
      } else {
        html += '<button type="button" id="sarReopenMissionBtn" class="situation-btn">Réactiver</button>';
      }
      html += '<button type="button" id="sarDeleteMissionBtn" class="situation-btn situation-btn-delete" style="color:#c62828;border-color:#c62828;background:#fff;">Supprimer</button>';
    }
    html += '</div></div>';

    html += '<label class="situation-filter"><input type="checkbox" id="sarModeCheckbox"' +
      (sarModeActive ? ' checked' : '') +
      (canEdit ? '' : ' disabled') +
      '> Mode SAR</label>';

    html += '<label class="situation-filter"><input type="checkbox" id="sarLayerCheckbox"' +
      (layerVisible ? ' checked' : '') +
      (mission ? '' : ' disabled') +
      '> Afficher sur la carte</label>';

    if (mission && canEdit && sarModeActive) {
      if (mission.type === 'aeronef') {
        html += '<div class="sar-draw-tools"><span class="sar-draw-label">Aéronef — DF / balise</span><div class="situation-toolbar">';
        html += '<button type="button" class="situation-btn sar-aeronef-btn" data-sar-action="station_df">Station DF</button>';
        html += '<button type="button" class="situation-btn sar-aeronef-btn" data-sar-action="bearing">Relèvement</button>';
        html += '</div></div>';
      } else {
        html += '<div class="sar-draw-tools"><span class="sar-draw-label">Points</span><div class="situation-toolbar">';
        T.pointRoles(mission.type).forEach((role) => {
          html += '<button type="button" class="situation-btn sar-draw-btn" data-sar-role="' + role.id + '" data-sar-geom="point">' + role.shortLabel + '</button>';
        });
        html += '</div><span class="sar-draw-label">Polylignes</span><div class="situation-toolbar">';
        T.lineRoles(mission.type).forEach((role) => {
          html += '<button type="button" class="situation-btn sar-draw-btn" data-sar-role="' + role.id + '" data-sar-geom="line">' + role.shortLabel + '</button>';
        });
        html += '</div><span class="sar-draw-label">Polygones</span><div class="situation-toolbar">';
        T.polygonRoles(mission.type).forEach((role) => {
          html += '<button type="button" class="situation-btn sar-draw-btn" data-sar-role="' + role.id + '" data-sar-geom="polygon">' + role.shortLabel + '</button>';
        });
        html += '</div></div>';
      }
    }

    if (mission && mission.type === 'aeronef') {
      const receptions = receptionBearings(mission);
      const fixFeats = getEstimatedFixFeatures(mission);
      const hasFix = fixFeats.length > 0;
      let uncVal = T.DEFAULT_UNCERTAINTY_KM;
      const refFix = getEstimatedFixFeature(mission);
      if (refFix && refFix.properties && refFix.properties[T.PROP_UNCERTAINTY_KM] != null) {
        uncVal = refFix.properties[T.PROP_UNCERTAINTY_KM];
      }

      html += '<div class="sar-intersection-panel">';
      html += '<span class="sar-draw-label">Intersection DF (SAR-3)</span>';
      html += '<p class="situation-hint sar-intersection-hint">';
      if (receptions.length < 2) {
        html += 'Au moins 2 relèvements réception (stations distinctes) requis.';
      } else {
        html += receptions.length + ' relèvement(s) réception — ';
        if (!hasFix) {
          html += 'intersection non calculée.';
        } else if (fixFeats.length === 1) {
          html += '1 candidat calculé.';
        } else {
          html += fixFeats.length + ' candidats calculés (couleurs distinctes).';
        }
      }
      html += '</p>';
      html += '<label class="sar-uncertainty-label">Incertitude (km)<input type="number" id="sarUncertaintyKm" min="0.1" max="50" step="0.1" value="' + uncVal + '"' +
        (canEdit ? '' : ' disabled') + '></label>';
      html += '<div class="situation-toolbar">';
      html += '<button type="button" id="sarComputeIntersectionBtn" class="situation-btn situation-btn-primary"' +
        (canEdit && receptions.length >= 2 ? '' : ' disabled') + '>Calculer intersection</button>';
      if (hasFix && canEdit) {
        html += '<button type="button" id="sarClearFixBtn" class="situation-btn">Effacer fixe(s)</button>';
      }
      html += '</div>';

      if (hasFix && (sarModeActive || layerVisible)) {
        ensureVisibleFixIds(mission);
        html += '<div class="sar-fix-checklist-wrap">';
        html += '<span class="sar-draw-label">Fixes sur la carte</span>';
        if (fixFeats.length > 1) {
          html += '<div class="situation-toolbar sar-fix-toggle-all">';
          html += '<button type="button" id="sarShowAllFixesBtn" class="situation-btn">Tout afficher</button>';
          html += '<button type="button" id="sarHideAllFixesBtn" class="situation-btn">Tout masquer</button>';
          html += '</div>';
        }
        html += '<ul class="sar-fix-checklist">';
        fixFeats.forEach((fixFeat) => {
          const fixProps = fixFeat.properties || {};
          const fixId = fixProps.id;
          const color = fixProps[T.PROP_FIX_COLOR] || '#c62828';
          const fixIndex = fixProps[T.PROP_FIX_INDEX] || '?';
          const isBest = fixProps[T.PROP_FIX_IS_BEST] === true;
          const checked = isFixVisible(mission, fixId) ? ' checked' : '';
          const quality = fixProps[T.PROP_QUALITY_ANGLE] != null
            ? escapeHtml(String(fixProps[T.PROP_QUALITY_ANGLE])) + '° (' +
              escapeHtml(T.qualityLabel(fixProps[T.PROP_QUALITY_ANGLE])) + ')'
            : '—';
          html += '<li class="sar-fix-check-row' + (isBest ? ' sar-fix-check-row-best' : '') + '">';
          html += '<label class="sar-fix-check-label">';
          html += '<input type="checkbox" class="sar-fix-visibility-cb" data-fix-id="' + escapeHtml(fixId) + '"' + checked + '>';
          html += '<span class="sar-fix-swatch" style="background:' + escapeHtml(color) + ';"></span>';
          html += '<span class="sar-fix-check-text">';
          html += '<span class="sar-fix-check-title">Fix ' + escapeHtml(String(fixIndex));
          if (isBest) html += ' <span class="sar-fix-best-badge">meilleur</span>';
          html += '</span>';
          html += '<span class="sar-fix-check-meta">' + formatFixStationPair(mission, fixProps, receptions) + '</span>';
          html += '<span class="sar-fix-check-meta">Angle : ' + quality + '</span>';
          html += '</span></label></li>';
        });
        html += '</ul></div>';

        const bestFix = getEstimatedFixFeature(mission);
        if (bestFix && bestFix.geometry && bestFix.geometry.coordinates) {
          const bp = bestFix.properties || {};
          const bc = bestFix.geometry.coordinates;
          html += '<div class="sar-fix-details">';
          html += '<div class="sar-fix-line"><b>Meilleur fixe — coordonnées</b></div>';
          formatCoordsLines(bc[1], bc[0]).forEach((line) => {
            html += '<div class="sar-fix-line">' + escapeHtml(line) + '</div>';
          });
          if (bp[T.PROP_UNCERTAINTY_KM] != null) {
            html += '<div class="sar-fix-line"><b>Incertitude :</b> ± ' +
              escapeHtml(String(bp[T.PROP_UNCERTAINTY_KM])) + ' km</div>';
          }
          html += '</div>';
        }
      } else if (hasFix) {
        html += '<p class="situation-hint sar-intersection-hint">Activez le mode SAR ou l\'affichage carte pour choisir les fixes visibles.</p>';
      }

      html += '<div class="situation-toolbar">';
      html += '<button type="button" id="sarExportReportBtn" class="situation-btn"' +
        (hasFix ? '' : ' disabled') + '>Exporter rapport SAR</button>';
      html += '<button type="button" id="sarCopyReportBtn" class="situation-btn"' +
        (hasFix ? '' : ' disabled') + '>Copier rapport</button>';
      html += '</div></div>';
    }

    html += '<div class="situation-toolbar">';
    html += '<button type="button" id="sarExportMissionBtn" class="situation-btn"' + (mission ? '' : ' disabled') + '>Exporter mission</button>';
    html += '<button type="button" id="sarExportAllBtn" class="situation-btn"' + (store.missions.length ? '' : ' disabled') + '>Exporter tout</button>';
    html += '</div>';

    sidebarEl.innerHTML = html;
    wireSidebarEvents();
  }

  function wireSidebarEvents() {
    const createBtn = document.getElementById('sarCreateMissionBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('sarNewMissionName');
        const typeEl = document.getElementById('sarNewMissionType');
        const name = (nameEl && nameEl.value || '').trim();
        const type = (typeEl && typeEl.value) || 'personne';
        if (!name) {
          alert('Indiquez un nom de mission.');
          return;
        }
        const mt = T.getMissionType(type);
        if (!mt || !mt.enabled) {
          alert('Ce type de mission n\'est pas encore disponible.');
          return;
        }
        createMission(name, type);
        if (nameEl) nameEl.value = '';
      });
    }

    const selectEl = document.getElementById('sarMissionSelect');
    if (selectEl) {
      selectEl.addEventListener('change', () => {
        setActiveMission(selectEl.value || null);
      });
    }

    const closeBtn = document.getElementById('sarCloseMissionBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => setMissionStatus(store.activeMissionId, 'closed'));

    const reopenBtn = document.getElementById('sarReopenMissionBtn');
    if (reopenBtn) reopenBtn.addEventListener('click', () => setMissionStatus(store.activeMissionId, 'active'));

    const deleteBtn = document.getElementById('sarDeleteMissionBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (!store.activeMissionId) return;
        const m = getMission(store.activeMissionId);
        if (!m) return;
        if (!confirm('Supprimer la mission « ' + m.name + ' » et tous ses éléments ?')) return;
        deleteMission(store.activeMissionId);
      });
    }

    const modeCb = document.getElementById('sarModeCheckbox');
    if (modeCb) {
      modeCb.addEventListener('change', (e) => {
        sarModeActive = e.target.checked;
        cancelInteractions();
        renderSidebar();
      });
    }

    const layerCb = document.getElementById('sarLayerCheckbox');
    if (layerCb) {
      layerCb.addEventListener('change', (e) => {
        layerVisible = e.target.checked;
        const layer = layersRef && layersRef[LAYER_NAME];
        if (!layer || !map) return;
        if (e.target.checked) {
          if (!map.hasLayer(layer)) layer.addTo(map);
        } else if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
        if (updateLegendFn) updateLegendFn();
        renderSidebar();
      });
    }

    document.querySelectorAll('.sar-draw-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleId = btn.getAttribute('data-sar-role');
        const geom = btn.getAttribute('data-sar-geom');
        if (geom === 'point') startPointPickMode(roleId);
        else if (geom === 'line') startLineDrawMode(roleId);
        else if (geom === 'polygon') startPolygonDrawMode(roleId);
      });
    });

    document.querySelectorAll('.sar-aeronef-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-sar-action');
        if (action === 'station_df') startPointPickMode('station_df');
        else if (action === 'bearing') startBearingFlow(null);
      });
    });

    const exportMissionBtn = document.getElementById('sarExportMissionBtn');
    if (exportMissionBtn) {
      exportMissionBtn.addEventListener('click', () => exportGeoJSON(store.activeMissionId));
    }
    const exportAllBtn = document.getElementById('sarExportAllBtn');
    if (exportAllBtn) exportAllBtn.addEventListener('click', () => exportGeoJSON(null));

    const computeBtn = document.getElementById('sarComputeIntersectionBtn');
    if (computeBtn) {
      computeBtn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission) return;
        const uncEl = document.getElementById('sarUncertaintyKm');
        const uncKm = uncEl ? Number(uncEl.value) : T.DEFAULT_UNCERTAINTY_KM;
        const res = computeAndApplyIntersection(mission, { uncertaintyKm: uncKm });
        if (!res.ok) {
          if (res.reason === 'need_two_bearings') {
            alert('Il faut au moins 2 relèvements réception depuis des stations distinctes.');
          } else if (res.reason === 'no_intersection') {
            alert('Aucune intersection (relèvements parallèles ou ambigus).');
          }
        }
      });
    }

    const clearFixBtn = document.getElementById('sarClearFixBtn');
    if (clearFixBtn) {
      clearFixBtn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission) return;
        removeEstimatedFix(mission);
        rebuildLayer();
        renderSidebar();
      });
    }

    document.querySelectorAll('.sar-fix-visibility-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const mission = getActiveMission();
        if (!mission) return;
        const fixId = e.target.getAttribute('data-fix-id');
        setFixVisibility(mission, fixId, e.target.checked);
      });
    });

    const showAllFixesBtn = document.getElementById('sarShowAllFixesBtn');
    if (showAllFixesBtn) {
      showAllFixesBtn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission) return;
        setAllFixesVisibility(mission, true);
        document.querySelectorAll('.sar-fix-visibility-cb').forEach((cb) => { cb.checked = true; });
      });
    }

    const hideAllFixesBtn = document.getElementById('sarHideAllFixesBtn');
    if (hideAllFixesBtn) {
      hideAllFixesBtn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission) return;
        setAllFixesVisibility(mission, false);
        document.querySelectorAll('.sar-fix-visibility-cb').forEach((cb) => { cb.checked = false; });
      });
    }

    const exportReportBtn = document.getElementById('sarExportReportBtn');
    if (exportReportBtn) {
      exportReportBtn.addEventListener('click', () => exportSarReport(store.activeMissionId));
    }

    const copyReportBtn = document.getElementById('sarCopyReportBtn');
    if (copyReportBtn) {
      copyReportBtn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission || !hasEstimatedFix(mission)) return;
        const text = buildSarReportText(mission);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            alert('Rapport copié dans le presse-papiers.');
          }).catch(() => {
            alert('Impossible de copier — utilisez « Exporter rapport SAR ».');
          });
        } else {
          alert('Presse-papiers non disponible — utilisez « Exporter rapport SAR ».');
        }
      });
    }
  }

  function createMission(name, type) {
    const mission = {
      id: newId(),
      name,
      type: type || 'personne',
      status: 'active',
      created_at: new Date().toISOString(),
      features: []
    };
    store.missions.push(mission);
    store.activeMissionId = mission.id;
    sarModeActive = true;
    layerVisible = true;
    saveStore();
    rebuildLayer();
    renderSidebar();
  }

  function deleteMission(id) {
    store.missions = store.missions.filter((m) => m.id !== id);
    if (store.activeMissionId === id) {
      store.activeMissionId = store.missions.length ? store.missions[0].id : null;
    }
    cancelInteractions();
    saveStore();
    rebuildLayer();
    renderSidebar();
  }

  function setActiveMission(id) {
    if (!id) {
      store.activeMissionId = null;
    } else if (getMission(id)) {
      store.activeMissionId = id;
    }
    cancelInteractions();
    saveStore();
    rebuildLayer();
    renderSidebar();
  }

  function setMissionStatus(id, status) {
    const mission = getMission(id);
    if (!mission) return;
    mission.status = status;
    if (status === 'closed') {
      sarModeActive = false;
      cancelInteractions();
    }
    saveStore();
    rebuildLayer();
    renderSidebar();
  }

  function persistFeature(mission, feature, mode, featureId) {
    if (!mission.features) mission.features = [];
    if (mode === 'edit') {
      const idx = mission.features.findIndex((f) => f.properties && f.properties.id === featureId);
      if (idx >= 0) mission.features[idx] = feature;
    } else {
      mission.features.push(feature);
    }
    saveStore();
    rebuildLayer();
  }

  function deleteFeature(featureId) {
    for (let i = 0; i < store.missions.length; i++) {
      const m = store.missions[i];
      const feat = (m.features || []).find((f) => f.properties && f.properties.id === featureId);
      if (!feat) continue;
      const props = feat.properties || {};
      let idsToRemove = new Set([featureId]);

      if (props[T.PROP_ROLE] === 'station_df') {
        (m.features || []).forEach((f) => {
          const p = f.properties || {};
          if (p[T.PROP_STATION_ID] === featureId) idsToRemove.add(p.id);
        });
      } else if (isBearingFeature(props) && props[T.PROP_BEARING_GROUP_ID]) {
        (m.features || []).forEach((f) => {
          const p = f.properties || {};
          if (p[T.PROP_BEARING_GROUP_ID] === props[T.PROP_BEARING_GROUP_ID]) idsToRemove.add(p.id);
        });
      }

      m.features = (m.features || []).filter((f) => !f.properties || !idsToRemove.has(f.properties.id));
      if (props[T.PROP_ROLE] === 'station_df' || isBearingFeature(props)) {
        removeEstimatedFix(m);
      }
      saveStore();
      rebuildLayer();
      if (m.type === 'aeronef') maybeAutoUpdateIntersection(m);
      else renderSidebar();
      return;
    }
  }

  function deleteBearingGroup(groupId) {
    for (let i = 0; i < store.missions.length; i++) {
      const m = store.missions[i];
      const len = (m.features || []).length;
      m.features = (m.features || []).filter((f) => {
        const p = f.properties || {};
        return p[T.PROP_BEARING_GROUP_ID] !== groupId;
      });
      if (m.features.length !== len) {
        removeEstimatedFix(m);
        saveStore();
        rebuildLayer();
        if (m.type === 'aeronef') maybeAutoUpdateIntersection(m);
        else renderSidebar();
        return;
      }
    }
  }

  function exportGeoJSON(missionId) {
    let features;
    let filename;
    if (missionId) {
      const m = getMission(missionId);
      if (!m) return;
      features = m.features || [];
      const safe = m.name.replace(/[^\w\u00C0-\u024F\-]+/g, '_').slice(0, 40);
      filename = 'sar_mission_' + safe + '.geojson';
    } else {
      features = allFeatures();
      filename = 'sar_missions.geojson';
    }
    const json = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildSarReportText(mission) {
    if (!mission) return '';
    const lines = [];
    lines.push('RAPPORT SAR — CARTOFF (outil offline)');
    lines.push('================================');
    lines.push('');
    lines.push('Mission : ' + mission.name);
    lines.push('Type : ' + (T.getMissionType(mission.type) ? T.getMissionType(mission.type).label : mission.type));
    lines.push('Statut : ' + missionStatusLabel(mission.status));
    lines.push('Créée le : ' + formatTimestamp(mission.created_at));
    lines.push('');
    const receptions = receptionBearings(mission);
    const fixFeats = getEstimatedFixFeatures(mission);
    lines.push('--- Relèvements réception ---');
    if (!receptions.length) {
      lines.push('(aucun)');
    } else {
      receptions.forEach((r, i) => {
        lines.push((i + 1) + '. ' + r.stationLabel + ' — azimut ' + r.azimuth + '°');
        lines.push('   Station : ' + r.stationLat.toFixed(6) + ', ' + r.stationLon.toFixed(6));
      });
    }
    lines.push('');
    lines.push('--- Fixe(s) estimé(s) (intersections) ---');
    if (!fixFeats.length) {
      lines.push('(non calculé)');
    } else {
      fixFeats.forEach((fixFeat) => {
        const fp = fixFeat.properties || {};
        const c = fixFeat.geometry && fixFeat.geometry.coordinates;
        if (!c) return;
        const lat = c[1];
        const lon = c[0];
        const fixIndex = fp[T.PROP_FIX_INDEX] || '?';
        const isBest = fp[T.PROP_FIX_IS_BEST] === true;
        lines.push('');
        lines.push('Fix ' + fixIndex + (isBest ? ' (meilleur)' : '') + ' :');
        if (fp[T.PROP_FIX_COLOR]) lines.push('Couleur carte : ' + fp[T.PROP_FIX_COLOR]);
        formatCoordsLines(lat, lon).forEach((l) => lines.push(l));
        if (fp[T.PROP_QUALITY_ANGLE] != null) {
          lines.push('Angle de coupe : ' + fp[T.PROP_QUALITY_ANGLE] + '° (' + T.qualityLabel(fp[T.PROP_QUALITY_ANGLE]) + ')');
        }
        if (fp[T.PROP_UNCERTAINTY_KM] != null) {
          lines.push('Incertitude : ± ' + fp[T.PROP_UNCERTAINTY_KM] + ' km');
        }
        if (fp.commune) lines.push('Commune : ' + fp.commune);
        const usedIds = (fp[T.PROP_FIX_STATION_IDS] || '').split(',').filter(Boolean);
        if (usedIds.length) {
          lines.push('Stations :');
          usedIds.forEach((sid) => {
            const st = findStationById(mission, sid);
            const stLabel = st && st.properties ? (st.properties.label || sid) : sid;
            const rec = receptions.find((r) => r.stationId === sid);
            const az = rec ? rec.azimuth + '°' : '—';
            lines.push('  - ' + stLabel + ' — azimut ' + az);
          });
        }
      });
    }
    lines.push('');
    lines.push('--- Avertissement ---');
    lines.push('Estimation indicative basée sur l\'intersection géodésique de relèvements DF.');
    lines.push('Ne remplace pas une analyse opérationnelle ni des données officielles.');
    lines.push('Outil 100 % offline — vérifier sur le terrain.');
    lines.push('');
    lines.push('Généré le ' + new Date().toLocaleString('fr-FR') + ' — Cartoff');
    return lines.join('\n');
  }

  function exportSarReport(missionId) {
    const m = getMission(missionId);
    if (!m || !hasEstimatedFix(m)) return;
    const text = buildSarReportText(m);
    const safe = m.name.replace(/[^\w\u00C0-\u024F\-]+/g, '_').slice(0, 40);
    const filename = 'sar_rapport_' + safe + '.txt';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function removeBearingPreview() {
    if (bearingPreviewLayer && map) {
      map.removeLayer(bearingPreviewLayer);
      bearingPreviewLayer = null;
    }
  }

  function bearingPreviewStyles() {
    const role = T.getRole('relevement_df');
    const receptionBase = (role && role.lineStyle) || { color: '#e65100', weight: 3 };
    const reciprocalBase = (role && role.lineStyleReciprocal) || { color: '#e65100', weight: 2, dashArray: '8 6' };
    return {
      reception: { ...receptionBase, opacity: 0.5, dashArray: '6 4', pane: 'sarPane' },
      reciprocal: { ...reciprocalBase, opacity: 0.4, pane: 'sarPane' }
    };
  }

  function peekBearingInputs() {
    const azRaw = panelAzimuthEl ? panelAzimuthEl.value : '0';
    const rangeRaw = panelRangeEl ? panelRangeEl.value : String(T.DEFAULT_RANGE_KM);
    if (azRaw === '' || !isFinite(Number(azRaw))) return null;
    const range = Number(rangeRaw);
    if (!isFinite(range) || range <= 0) return null;
    return {
      azimuth: T.normalizeAzimuth(azRaw),
      rangeKm: Math.max(0.1, Math.round(range * 10) / 10)
    };
  }

  function updateBearingPreview() {
    if (!map || !panelState) {
      removeBearingPreview();
      return;
    }
    if (panelState.mode !== 'addBearing' && panelState.mode !== 'editBearing') {
      removeBearingPreview();
      return;
    }
    const mission = getMission(panelState.missionId) || getActiveMission();
    if (!mission) {
      removeBearingPreview();
      return;
    }
    const station = findStationById(mission, panelState.stationId);
    if (!station || !station.geometry || !station.geometry.coordinates) {
      removeBearingPreview();
      return;
    }
    const bearing = peekBearingInputs();
    if (!bearing) {
      removeBearingPreview();
      return;
    }
    const coords = station.geometry.coordinates;
    const stationLon = coords[0];
    const stationLat = coords[1];
    const receptionCoords = T.bearingLineCoordinates(stationLat, stationLon, bearing.azimuth, bearing.rangeKm);
    const reciprocalCoords = T.bearingLineCoordinates(
      stationLat, stationLon, T.reciprocalAzimuth(bearing.azimuth), bearing.rangeKm
    );
    const styles = bearingPreviewStyles();
    const receptionLatLngs = receptionCoords.map((c) => L.latLng(c[1], c[0]));
    const reciprocalLatLngs = reciprocalCoords.map((c) => L.latLng(c[1], c[0]));
    if (!bearingPreviewLayer) {
      bearingPreviewLayer = L.layerGroup([
        L.polyline(receptionLatLngs, styles.reception),
        L.polyline(reciprocalLatLngs, styles.reciprocal)
      ], { pane: 'sarPane' }).addTo(map);
      return;
    }
    const layers = bearingPreviewLayer.getLayers();
    if (layers[0]) layers[0].setLatLngs(receptionLatLngs);
    if (layers[1]) layers[1].setLatLngs(reciprocalLatLngs);
  }

  function closePanel() {
    if (panelState && panelState.draftMarker && map) map.removeLayer(panelState.draftMarker);
    if (panelState && panelState.draftLayer && map) map.removeLayer(panelState.draftLayer);
    removeBearingPreview();
    panelState = null;
    if (panelEl) panelEl.hidden = true;
  }

  function showPanel(opts) {
    if (!panelEl) return;
    const role = T.getRole(opts.roleId);
    const panelKind = opts.panelKind || null;
    if (panelTitleEl) {
      if (opts.mode === 'editBearing') {
        panelTitleEl.textContent = 'Modifier — Relèvement DF';
      } else if (opts.mode === 'addBearing') {
        panelTitleEl.textContent = 'Nouveau — Relèvement DF';
      } else {
        panelTitleEl.textContent = opts.mode === 'edit'
          ? 'Modifier — ' + (role ? role.label : '')
          : 'Nouveau — ' + (role ? role.label : '');
      }
    }
    if (panelLabelEl) panelLabelEl.value = opts.label || (role ? role.label : '');
    if (panelNotesEl) panelNotesEl.value = opts.notes || '';
    if (panelTimestampEl) {
      panelTimestampEl.value = toDatetimeLocalValue(opts.created_at || '');
    }
    if (panelAzimuthEl) {
      panelAzimuthEl.value = opts.azimuth != null ? String(opts.azimuth) : '0';
    }
    if (panelRangeEl) {
      panelRangeEl.value = opts.rangeKm != null ? String(opts.rangeKm) : String(T.DEFAULT_RANGE_KM);
    }
    setPanelFieldVisibility(opts.roleId, panelKind);
    if (panelDeleteBtn) {
      panelDeleteBtn.hidden = opts.mode !== 'edit' && opts.mode !== 'editBearing';
    }
    panelEl.hidden = false;
    const pos = clampPopupPosition(panelEl, opts.clientX, opts.clientY, 10);
    panelEl.style.left = pos.x + 'px';
    panelEl.style.top = pos.y + 'px';
    if (opts.panelKind === 'bearing' || opts.mode === 'addBearing' || opts.mode === 'editBearing') {
      updateBearingPreview();
    } else {
      removeBearingPreview();
    }
  }

  function openPanelAdd(roleId, latlng, clientX, clientY, draftMarker, draftLayer, coordinates, geometryKind) {
    closePanel();
    cancelDrawMode();
    pendingPointRole = null;
    pendingBearingPick = false;
    if (map) {
      map.off('click', onPointPickClick);
      map.off('click', onBearingStationPickClick);
    }
    panelState = {
      mode: 'add',
      roleId,
      latlng,
      draftMarker: draftMarker || null,
      draftLayer: draftLayer || null,
      coordinates: coordinates || null,
      geometryKind: geometryKind || (coordinates ? 'line' : null)
    };
    showPanel({
      mode: 'add',
      roleId,
      panelKind: roleId === 'station_df' ? 'station' : null,
      clientX,
      clientY
    });
  }

  function openPanelEdit(feature, mission, latlng, clientX, clientY) {
    closePanel();
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const groupId = bearingGroupIdFromProps(props);

    if (isBearingFeature(props) && groupId) {
      const groupFeats = featuresInBearingGroup(mission, groupId);
      const reception = groupFeats.find((f) => f.properties && f.properties[T.PROP_BEARING_RECIPROCAL] === false) || feature;
      const rp = reception.properties || {};
      panelState = {
        mode: 'editBearing',
        bearingGroupId: groupId,
        stationId: rp[T.PROP_STATION_ID],
        missionId: mission.id,
        latlng
      };
      showPanel({
        mode: 'editBearing',
        roleId: 'relevement_df',
        panelKind: 'bearing',
        label: rp.label || '',
        notes: rp.notes || '',
        azimuth: rp[T.PROP_AZIMUTH],
        rangeKm: rp[T.PROP_RANGE_KM],
        clientX,
        clientY
      });
      return;
    }

    panelState = {
      mode: 'edit',
      featureId: props.id,
      roleId: props[T.PROP_ROLE],
      missionId: mission.id,
      latlng,
      existingGeometry: geom.type && geom.type !== 'Point' ? geom : null
    };
    showPanel({
      mode: 'edit',
      roleId: props[T.PROP_ROLE],
      panelKind: props[T.PROP_ROLE] === 'station_df' ? 'station' : null,
      label: props.label || '',
      notes: props.notes || '',
      created_at: props.created_at,
      clientX,
      clientY
    });
  }

  function buildBearingFeaturePair(mission, stationFeature, azimuth, rangeKm, label, notes, groupId, createdAt) {
    const stationProps = stationFeature.properties || {};
    const stationId = stationProps.id;
    const coords = stationFeature.geometry.coordinates;
    const stationLon = coords[0];
    const stationLat = coords[1];
    const az = T.normalizeAzimuth(azimuth);
    const range = Math.max(0.1, Number(rangeKm) || T.DEFAULT_RANGE_KM);
    const gid = groupId || newId();
    const ts = createdAt || new Date().toISOString();
    const baseLabel = label || ('Relèvement ' + az + '°');

    const receptionCoords = T.bearingLineCoordinates(stationLat, stationLon, az, range);
    const reciprocalCoords = T.bearingLineCoordinates(stationLat, stationLon, T.reciprocalAzimuth(az), range);

    const reception = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: receptionCoords },
      properties: T.buildFeatureProps(mission, 'relevement_df', {
        id: newId(),
        label: baseLabel,
        notes: notes || '',
        created_at: ts,
        [T.PROP_STATION_ID]: stationId,
        [T.PROP_BEARING_GROUP_ID]: gid,
        [T.PROP_AZIMUTH]: az,
        [T.PROP_RANGE_KM]: range,
        [T.PROP_BEARING_RECIPROCAL]: false
      })
    };
    const reciprocal = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: reciprocalCoords },
      properties: T.buildFeatureProps(mission, 'relevement_df', {
        id: newId(),
        label: baseLabel + ' (réciproque)',
        notes: notes || '',
        created_at: ts,
        [T.PROP_STATION_ID]: stationId,
        [T.PROP_BEARING_GROUP_ID]: gid,
        [T.PROP_AZIMUTH]: T.reciprocalAzimuth(az),
        [T.PROP_RANGE_KM]: range,
        [T.PROP_BEARING_RECIPROCAL]: true
      })
    };
    enrichLocationProps(reception.properties, stationLat, stationLon);
    enrichLocationProps(reciprocal.properties, stationLat, stationLon);
    return { reception, reciprocal, groupId: gid };
  }

  function persistBearingPair(mission, stationFeature, azimuth, rangeKm, label, notes, groupId, createdAt) {
    const pair = buildBearingFeaturePair(mission, stationFeature, azimuth, rangeKm, label, notes, groupId, createdAt);
    if (groupId) {
      mission.features = (mission.features || []).filter((f) => {
        const p = f.properties || {};
        return p[T.PROP_BEARING_GROUP_ID] !== groupId;
      });
    }
    mission.features.push(pair.reception);
    mission.features.push(pair.reciprocal);
    saveStore();
    rebuildLayer();
    if (mission.type === 'aeronef') maybeAutoUpdateIntersection(mission);
    else renderSidebar();
  }

  function openBearingPanel(stationId, clientX, clientY, editGroupId) {
    const mission = getActiveMission();
    if (!mission || !missionCanEdit(mission)) return;
    const station = findStationById(mission, stationId);
    if (!station) {
      alert('Station DF introuvable.');
      return;
    }
    closePanel();
    cancelDrawMode();
    pendingPointRole = null;
    pendingBearingPick = false;
    if (map) map.off('click', onBearingStationPickClick);

    const coords = station.geometry.coordinates;
    const latlng = L.latLng(coords[1], coords[0]);

    if (editGroupId) {
      const groupFeats = featuresInBearingGroup(mission, editGroupId);
      const reception = groupFeats.find((f) => f.properties && f.properties[T.PROP_BEARING_RECIPROCAL] === false);
      const rp = (reception && reception.properties) || {};
      panelState = {
        mode: 'editBearing',
        bearingGroupId: editGroupId,
        stationId,
        missionId: mission.id,
        latlng
      };
      showPanel({
        mode: 'editBearing',
        roleId: 'relevement_df',
        panelKind: 'bearing',
        label: rp.label || '',
        notes: rp.notes || '',
        azimuth: rp[T.PROP_AZIMUTH],
        rangeKm: rp[T.PROP_RANGE_KM],
        clientX,
        clientY
      });
      return;
    }

    panelState = {
      mode: 'addBearing',
      stationId,
      missionId: mission.id,
      latlng
    };
    showPanel({
      mode: 'addBearing',
      roleId: 'relevement_df',
      panelKind: 'bearing',
      label: 'Relèvement DF',
      notes: '',
      azimuth: 0,
      rangeKm: T.DEFAULT_RANGE_KM,
      clientX,
      clientY
    });
  }

  function parseBearingInputs() {
    const azRaw = panelAzimuthEl ? panelAzimuthEl.value : '0';
    const rangeRaw = panelRangeEl ? panelRangeEl.value : String(T.DEFAULT_RANGE_KM);
    const az = T.normalizeAzimuth(azRaw);
    if (azRaw === '' || !isFinite(Number(azRaw))) {
      alert('Indiquez un azimut valide (0–360°).');
      return null;
    }
    const range = Number(rangeRaw);
    if (!isFinite(range) || range <= 0) {
      alert('Indiquez une portée valide (km).');
      return null;
    }
    return { azimuth: az, rangeKm: Math.round(range * 10) / 10 };
  }

  function saveBearingPanel() {
    if (!panelState) return;
    const mission = getMission(panelState.missionId) || getActiveMission();
    if (!mission || !missionCanEdit(mission)) return;
    const station = findStationById(mission, panelState.stationId);
    if (!station) {
      alert('Station DF introuvable.');
      return;
    }
    const bearing = parseBearingInputs();
    if (!bearing) return;
    const label = (panelLabelEl && panelLabelEl.value || '').trim() || ('Relèvement ' + bearing.azimuth + '°');
    const notes = (panelNotesEl && panelNotesEl.value || '').trim();
    const groupId = panelState.mode === 'editBearing' ? panelState.bearingGroupId : null;
    let createdAt = null;
    if (panelState.mode === 'editBearing') {
      const groupFeats = featuresInBearingGroup(mission, groupId);
      const reception = groupFeats.find((f) => f.properties && f.properties[T.PROP_BEARING_RECIPROCAL] === false);
      createdAt = reception && reception.properties && reception.properties.created_at;
    }
    persistBearingPair(mission, station, bearing.azimuth, bearing.rangeKm, label, notes, groupId, createdAt);
    closePanel();
  }

  function savePanel() {
    if (!panelState) return;
    if (panelState.mode === 'addBearing' || panelState.mode === 'editBearing') {
      saveBearingPanel();
      return;
    }
    const mission = getMission(panelState.missionId) || getActiveMission();
    if (!mission || !missionCanEdit(mission)) return;

    const roleId = panelState.roleId;
    const role = T.getRole(roleId);
    const label = (panelLabelEl && panelLabelEl.value || '').trim() || (role ? role.label : '');
    const notes = (panelNotesEl && panelNotesEl.value || '').trim();

    let geometry;
    let lat;
    let lon;

    if (panelState.coordinates) {
      if (panelState.geometryKind === 'polygon') {
        geometry = { type: 'Polygon', coordinates: panelState.coordinates.slice() };
        const ring = panelState.coordinates[0];
        lon = ring[0][0];
        lat = ring[0][1];
      } else {
        geometry = { type: 'LineString', coordinates: panelState.coordinates.slice() };
        lon = panelState.coordinates[0][0];
        lat = panelState.coordinates[0][1];
      }
    } else if (panelState.latlng) {
      if (panelState.mode === 'edit' && panelState.existingGeometry) {
        geometry = {
          type: panelState.existingGeometry.type,
          coordinates: JSON.parse(JSON.stringify(panelState.existingGeometry.coordinates))
        };
        if (geometry.type === 'Polygon' && geometry.coordinates[0] && geometry.coordinates[0].length) {
          const c = geometry.coordinates[0][0];
          lon = c[0];
          lat = c[1];
        } else if (geometry.type === 'LineString' && geometry.coordinates.length) {
          lon = geometry.coordinates[0][0];
          lat = geometry.coordinates[0][1];
        } else {
          lat = panelState.latlng.lat;
          lon = panelState.latlng.lng;
        }
      } else {
        lat = panelState.latlng.lat;
        lon = panelState.latlng.lng;
        geometry = { type: 'Point', coordinates: [lon, lat] };
      }
    } else {
      return;
    }

    let props;
    if (panelState.mode === 'edit') {
      const found = findFeature(panelState.featureId);
      const prev = (found && found.feature.properties) || {};
      props = T.buildFeatureProps(mission, roleId, {
        id: panelState.featureId,
        label,
        notes,
        created_at: prev.created_at || new Date().toISOString(),
        [T.PROP_AZIMUTH]: prev[T.PROP_AZIMUTH],
        [T.PROP_RANGE_KM]: prev[T.PROP_RANGE_KM],
        [T.PROP_BEARING_RECIPROCAL]: prev[T.PROP_BEARING_RECIPROCAL]
      });
      props.commune = prev.commune;
      props.dfci = prev.dfci;
    } else {
      props = T.buildFeatureProps(mission, roleId, { id: newId(), label, notes });
    }
    const ts = parseDatetimeLocal(panelTimestampEl && panelTimestampEl.value);
    if (ts && roleId === 'station_df') props.created_at = ts;
    enrichLocationProps(props, lat, lon);

    const feature = { type: 'Feature', geometry, properties: props };
    persistFeature(mission, feature, panelState.mode, panelState.featureId);
    closePanel();
  }

  function deletePanelFeature() {
    if (!panelState) return;
    if (panelState.mode === 'editBearing' && panelState.bearingGroupId) {
      deleteBearingGroup(panelState.bearingGroupId);
      closePanel();
      return;
    }
    if (panelState.mode !== 'edit') return;
    deleteFeature(panelState.featureId);
    closePanel();
  }

  function updateDrawUI() {
    if (!drawFinishBtn || !drawState) {
      if (drawFinishBtn) drawFinishBtn.disabled = true;
      return;
    }
    const minVerts = drawState.mode === 'polygon' ? 3 : 2;
    drawFinishBtn.disabled = drawState.vertices.length < minVerts;
  }

  function onDrawClick(e) {
    if (!drawState) return;
    drawState.vertices.push(e.latlng);
    drawState.previewLayer.setLatLngs(
      drawState.mode === 'polygon' ? [drawState.vertices] : drawState.vertices
    );
    updateDrawUI();
  }

  function cancelDrawMode() {
    if (!drawState) return;
    if (map) {
      map.removeLayer(drawState.previewLayer);
      map.off('click', onDrawClick);
      map.off('dblclick', onDrawDblClick);
      map.getContainer().classList.remove('situation-line-drawing');
      map.doubleClickZoom.enable();
    }
    drawState = null;
    if (drawBannerEl) drawBannerEl.hidden = true;
  }

  function onDrawDblClick(e) {
    if (!drawState || drawState.mode !== 'line' || drawState.vertices.length < 2) return;
    L.DomEvent.stop(e);
    finishDraw(e.originalEvent.clientX, e.originalEvent.clientY);
  }

  function finishDraw(clientX, clientY) {
    if (!drawState) return;
    const minVerts = drawState.mode === 'polygon' ? 3 : 2;
    if (drawState.vertices.length < minVerts) return;

    const roleId = drawState.roleId;
    const role = T.getRole(roleId);
    let coordinates;
    let geometryKind;
    if (drawState.mode === 'polygon') {
      const ring = drawState.vertices.map((ll) => [ll.lng, ll.lat]);
      ring.push(ring[0].slice());
      coordinates = [ring];
      geometryKind = 'polygon';
    } else {
      coordinates = drawState.vertices.map((ll) => [ll.lng, ll.lat]);
      geometryKind = 'line';
    }

    const draftLayer = drawState.previewLayer;
    if (drawState.mode === 'polygon' && role && role.polygonStyle) {
      draftLayer.setStyle({ ...role.polygonStyle, dashArray: null, opacity: 0.65 });
    } else if (drawState.mode === 'line' && role && role.lineStyle) {
      draftLayer.setStyle({ ...role.lineStyle, dashArray: null, opacity: 0.65 });
    }

    const vertices = drawState.vertices.slice();
    const drawMode = drawState.mode;
    drawState = null;
    if (map) {
      map.getContainer().classList.remove('situation-line-drawing');
      map.off('click', onDrawClick);
      map.off('dblclick', onDrawDblClick);
      map.doubleClickZoom.enable();
    }
    if (drawBannerEl) drawBannerEl.hidden = true;

    const latlng = drawMode === 'polygon'
      ? L.polygon(vertices).getBounds().getCenter()
      : L.latLng(coordinates[0][1], coordinates[0][0]);
    openPanelAdd(roleId, latlng, clientX, clientY, null, draftLayer, coordinates, geometryKind);
  }

  function startDrawMode(roleId, mode, initialLatLng) {
    const mission = getActiveMission();
    if (!missionCanEdit(mission) || !sarModeActive || !map) return;
    closePanel();
    cancelDrawMode();
    pendingPointRole = null;
    map.off('click', onPointPickClick);

    const role = T.getRole(roleId);
    const isPolygon = mode === 'polygon';
    const vertices = initialLatLng ? [initialLatLng] : [];
    let previewLayer;
    if (isPolygon) {
      const style = (role && role.polygonStyle)
        ? { ...role.polygonStyle, dashArray: '8 6', opacity: 0.85, fillOpacity: 0.15 }
        : { color: '#2e7d32', weight: 2, fillColor: '#43a047', fillOpacity: 0.15, dashArray: '8 6', opacity: 0.85 };
      previewLayer = L.polygon([vertices], { ...style, pane: 'sarPane' }).addTo(map);
    } else {
      const style = (role && role.lineStyle)
        ? { ...role.lineStyle, dashArray: '8 6', opacity: 0.85 }
        : { color: '#3949ab', weight: 4, dashArray: '8 6', opacity: 0.85 };
      previewLayer = L.polyline(vertices, { ...style, pane: 'sarPane' }).addTo(map);
    }

    drawState = { roleId, mode, vertices, previewLayer };
    map.getContainer().classList.add('situation-line-drawing');
    if (drawBannerEl) drawBannerEl.hidden = false;
    if (drawBannerTextEl) {
      drawBannerTextEl.textContent = isPolygon
        ? 'Zone fouillée — cliquez pour le contour (min. 3 points), Terminer ferme le polygone'
        : 'Polyligne SAR — cliquez pour ajouter des points, Terminer pour valider (min. 2)';
    }
    updateDrawUI();
    map.doubleClickZoom.disable();
    map.on('click', onDrawClick);
    if (!isPolygon) map.on('dblclick', onDrawDblClick);
  }

  function startLineDrawMode(roleId, initialLatLng) {
    startDrawMode(roleId, 'line', initialLatLng);
  }

  function startPolygonDrawMode(roleId, initialLatLng) {
    startDrawMode(roleId, 'polygon', initialLatLng);
  }

  function onPointPickClick(e) {
    if (!pendingPointRole) return;
    const roleId = pendingPointRole;
    pendingPointRole = null;
    map.off('click', onPointPickClick);
    map.getContainer().classList.remove('situation-line-drawing');
    const role = T.getRole(roleId);
    const draftMarker = L.marker(e.latlng, {
      icon: getMarkerIcon(roleId, false),
      pane: 'sarPane',
      interactive: false
    }).addTo(map);
    const rect = map.getContainer().getBoundingClientRect();
    openPanelAdd(roleId, e.latlng, e.originalEvent.clientX, e.originalEvent.clientY, draftMarker);
  }

  function onBearingStationPickClick(e) {
    if (!pendingBearingPick) return;
    const mission = getActiveMission();
    if (!mission) return;
    let hitStation = null;
    const layers = layersRef && layersRef[LAYER_NAME];
    if (layers && map) {
      layers.eachLayer((layer) => {
        if (hitStation) return;
        const feat = layer._cartoffSarFeature;
        if (!feat || !feat.properties) return;
        if (feat.properties[T.PROP_ROLE] !== 'station_df') return;
        if (layer.getLatLng && e.latlng.distanceTo(layer.getLatLng()) < 25) {
          hitStation = feat;
        }
      });
    }
    if (!hitStation) {
      const stations = stationFeatures(mission);
      let bestDist = Infinity;
      stations.forEach((f) => {
        const c = f.geometry.coordinates;
        const d = e.latlng.distanceTo(L.latLng(c[1], c[0]));
        if (d < bestDist && d < 500) {
          bestDist = d;
          hitStation = f;
        }
      });
    }
    if (!hitStation) {
      alert('Cliquez sur une station DF (marqueur ▲).');
      return;
    }
    pendingBearingPick = false;
    if (map) {
      map.off('click', onBearingStationPickClick);
      map.getContainer().classList.remove('situation-line-drawing');
    }
    if (drawBannerEl) drawBannerEl.hidden = true;
    openBearingPanel(hitStation.properties.id, e.originalEvent.clientX, e.originalEvent.clientY);
  }

  function startBearingFlow(stationId) {
    const mission = getActiveMission();
    if (!missionCanEdit(mission) || !sarModeActive || !map) return;
    cancelDrawMode();
    closePanel();
    pendingPointRole = null;

    const stations = stationFeatures(mission);
    if (!stations.length) {
      alert('Placez d\'abord une station DF.');
      return;
    }
    if (stationId) {
      openBearingPanel(stationId, window.innerWidth / 2, 120);
      return;
    }
    if (stations.length === 1) {
      openBearingPanel(stations[0].properties.id, window.innerWidth / 2, 120);
      return;
    }

    pendingBearingPick = true;
    map.getContainer().classList.add('situation-line-drawing');
    map.on('click', onBearingStationPickClick);
    if (drawBannerEl) {
      drawBannerEl.hidden = false;
      if (drawBannerTextEl) {
        drawBannerTextEl.textContent = 'Cliquez sur une station DF pour ajouter un relèvement';
      }
    }
  }

  function startPointPickMode(roleId) {
    const mission = getActiveMission();
    if (!missionCanEdit(mission) || !sarModeActive || !map) return;
    cancelDrawMode();
    closePanel();
    pendingBearingPick = false;
    map.off('click', onBearingStationPickClick);
    pendingPointRole = roleId;
    map.getContainer().classList.add('situation-line-drawing');
    map.on('click', onPointPickClick);
    const role = T.getRole(roleId);
    if (drawBannerEl) {
      drawBannerEl.hidden = false;
      if (drawBannerTextEl) {
        drawBannerTextEl.textContent = 'Placez un point « ' + (role ? role.label : roleId) + ' » sur la carte';
      }
    }
  }

  function cancelInteractions() {
    cancelDrawMode();
    closePanel();
    pendingPointRole = null;
    pendingBearingPick = false;
    if (map) {
      map.off('click', onPointPickClick);
      map.off('click', onBearingStationPickClick);
      map.getContainer().classList.remove('situation-line-drawing');
    }
    if (drawBannerEl) drawBannerEl.hidden = true;
  }

  function openFeatureContextMenu(clientX, clientY, feature, mission, latlng) {
    if (typeof global.openMapContextMenuForSar !== 'function') return;
    const geom = feature.geometry || {};
    global.openMapContextMenuForSar(clientX, clientY, {
      type: geom.type === 'LineString' ? 'line' : (geom.type === 'Polygon' ? 'polygon' : 'marker'),
      feature,
      latlng
    });
  }

  function buildMapContextMenu(menuEl, addItem, target, clientX, clientY) {
    if (!sarModeActive) return;
    const mission = getActiveMission();
    if (!mission) return;

    if (target.type === 'marker' || target.type === 'line' || target.type === 'polygon') {
      const feature = target.feature;
      if (feature && feature.properties && feature.properties[T.PROP_MISSION_ID]) {
        const section = document.createElement('div');
        section.className = 'map-context-menu-section';
        section.textContent = 'Mission SAR';
        menuEl.appendChild(section);
        const props = feature.properties;
        const found = findFeature(props.id);
        const m = found ? found.mission : mission;
        const canEdit = missionCanEdit(m) && m.id === mission.id;
        if (canEdit) {
          if (props[T.PROP_ROLE] === 'fixe_estime') {
            addItem('Effacer tous les fixe(s) estimé(s)', () => {
              removeEstimatedFix(m);
              rebuildLayer();
              renderSidebar();
            }, { danger: true });
            return;
          }
          if (props[T.PROP_ROLE] === 'incertitude_fix') return;
          if (props[T.PROP_ROLE] === 'station_df') {
            addItem('Relèvement depuis cette station', () => {
              openBearingPanel(props.id, clientX, clientY);
            });
          }
          if (isBearingFeature(props)) {
            addItem('Modifier ce relèvement', () => {
              openPanelEdit(feature, m, target.latlng, clientX, clientY);
            });
            addItem('Supprimer ce relèvement', () => {
              const gid = bearingGroupIdFromProps(props);
              if (gid) deleteBearingGroup(gid);
            }, { danger: true });
          } else {
            addItem('Modifier cet élément SAR', () => {
              openPanelEdit(feature, m, target.latlng, clientX, clientY);
            });
            addItem('Supprimer', () => deleteFeature(props.id), { danger: true });
          }
        }
        return;
      }
    }

    if (!missionCanEdit(mission)) return;

    const section = document.createElement('div');
    section.className = 'map-context-menu-section';
    section.textContent = 'Mission SAR';
    menuEl.appendChild(section);

    if (mission.type === 'aeronef') {
      addItem('Station DF', () => {
        const draftMarker = L.marker(target.latlng, {
          icon: getMarkerIcon('station_df', false),
          pane: 'sarPane',
          interactive: false
        }).addTo(map);
        openPanelAdd('station_df', target.latlng, clientX, clientY, draftMarker);
      });
      const stations = stationFeatures(mission);
      if (stations.length === 1) {
        addItem('Relèvement depuis la station', () => {
          openBearingPanel(stations[0].properties.id, clientX, clientY);
        });
      } else if (stations.length > 1) {
        addItem('Relèvement — choisir une station', () => {
          startBearingFlow(null);
        });
      }
      return;
    }

    T.pointRoles(mission.type).forEach((role) => {
      addItem(role.label, () => {
        const draftMarker = L.marker(target.latlng, {
          icon: getMarkerIcon(role.id, false),
          pane: 'sarPane',
          interactive: false
        }).addTo(map);
        openPanelAdd(role.id, target.latlng, clientX, clientY, draftMarker);
      });
    });
    T.lineRoles(mission.type).forEach((role) => {
      addItem(role.label + ' (polyligne)', () => {
        startLineDrawMode(role.id, target.latlng);
      });
    });
    T.polygonRoles(mission.type).forEach((role) => {
      addItem(role.label + ' (zone)', () => {
        startPolygonDrawMode(role.id, target.latlng);
      });
    });
  }

  function getFeatureFromDomEvent(domEvent) {
    if (!layersRef || !layersRef[LAYER_NAME] || !map || !map.hasLayer(layersRef[LAYER_NAME])) return null;
    let el = domEvent.target;
    const container = map.getContainer();
    while (el && el !== container) {
      const layer = map._targets && map._targets[L.util.stamp(el)];
      if (layer && layer._cartoffSarFeature) return layer;
      el = el.parentNode;
    }
    return null;
  }

  function getLegendHtml() {
    if (!legendEntries.length) return LAYER_NAME + ' — aucun élément<br>';
    let html = '';
    legendEntries.forEach((entry) => {
      const role = entry.role;
      if (role.geometry === 'point') {
        html += '<span class="sar-legend-icon ' + role.legendClass + '">' + (role.shortLabel || '?') + '</span> ' + entry.label + '<br>';
      } else if (role.geometry === 'polygon') {
        const ps = role.polygonStyle || {};
        const color = ps.color || '#333';
        const fill = ps.fillColor || color;
        html += '<span class="sar-legend-polygon" style="background:' + fill + ';border:2px solid ' + color + '"></span> ' + entry.label + '<br>';
      } else {
        const color = (role.lineStyle && role.lineStyle.color) || '#333';
        const weight = (role.lineStyle && role.lineStyle.weight) || 3;
        const dash = role.id === 'relevement_df' ? ' (réception / réciproque)' : '';
        if (role.id === 'relevement_df') {
          html += '<span class="lineBox" style="border-top:' + weight + 'px solid ' + color + '"></span> ' +
            entry.label + dash + '<br>';
        } else {
          html += '<span class="lineBox" style="border-top:' + weight + 'px solid ' + color + '"></span> ' + entry.label + '<br>';
        }
      }
    });
    return html;
  }

  function init(options) {
    map = options.map;
    layersRef = options.layers;
    updateLegendFn = options.updateLegend;
    findCommuneFn = options.findCommune || null;
    latLngToDfciFn = options.latLngToDfci || null;
    latLngToUtmFn = options.latLngToUtm || null;
    sidebarEl = options.sidebarEl;
    panelEl = options.panelEl;
    panelTitleEl = options.panelTitleEl;
    panelLabelEl = options.panelLabelEl;
    panelNotesEl = options.panelNotesEl;
    panelSaveBtn = options.panelSaveBtn;
    panelCancelBtn = options.panelCancelBtn;
    panelDeleteBtn = options.panelDeleteBtn;
    panelDfFieldsEl = options.panelDfFieldsEl;
    panelTimestampEl = options.panelTimestampEl;
    panelBearingFieldsEl = options.panelBearingFieldsEl;
    panelAzimuthEl = options.panelAzimuthEl;
    panelRangeEl = options.panelRangeEl;
    drawBannerEl = options.drawBannerEl;
    drawBannerTextEl = options.drawBannerTextEl;
    drawFinishBtn = options.drawFinishBtn;
    drawCancelBtn = options.drawCancelBtn;

    loadStore();
    if (store.activeMissionId && !getMission(store.activeMissionId)) {
      store.activeMissionId = store.missions.length ? store.missions[0].id : null;
    }
    store.missions.forEach((m) => {
      if (m.type === 'aeronef') {
        if (receptionBearings(m).length >= 2 && !hasEstimatedFix(m)) {
          computeAndApplyIntersection(m, { renderSidebar: false, rebuild: false });
        } else if (hasEstimatedFix(m)) {
          ensureVisibleFixIds(m);
        }
      }
    });
    saveStore();
    renderSidebar();
    if (store.activeMissionId) rebuildLayer();

    if (panelSaveBtn) panelSaveBtn.addEventListener('click', savePanel);
    if (panelCancelBtn) panelCancelBtn.addEventListener('click', closePanel);
    if (panelDeleteBtn) panelDeleteBtn.addEventListener('click', deletePanelFeature);
    if (panelAzimuthEl) panelAzimuthEl.addEventListener('input', updateBearingPreview);
    if (panelRangeEl) panelRangeEl.addEventListener('input', updateBearingPreview);
    if (drawFinishBtn) {
      drawFinishBtn.addEventListener('click', () => {
        if (!drawState) return;
        const minVerts = drawState.mode === 'polygon' ? 3 : 2;
        if (drawState.vertices.length < minVerts) return;
        const rect = drawBannerEl.getBoundingClientRect();
        finishDraw(rect.left + rect.width / 2, rect.bottom + 8);
      });
    }
    if (drawCancelBtn) drawCancelBtn.addEventListener('click', cancelInteractions);
  }

  global.CartoffSar = {
    LAYER_NAME,
    STORAGE_KEY,
    init,
    isSarModeActive: () => sarModeActive,
    isDrawOrPanelActive: () => !!(drawState || panelState || pendingPointRole || pendingBearingPick),
    cancelInteractions,
    getFeatureFromDomEvent,
    buildMapContextMenu,
    getLegendHtml,
    exportGeoJSON,
    exportSarReport,
    buildSarReportText,
    computeAndApplyIntersection,
    getStore: () => store
  };
})(typeof window !== 'undefined' ? window : this);
