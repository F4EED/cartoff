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
  let getElevationFn = null;

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
  let panelBearingTargetEl = null;
  let panelTeamFieldsEl = null;
  let panelTeamEl = null;
  let drawBannerEl = null;
  let drawBannerTextEl = null;
  let drawFinishBtn = null;
  let drawCancelBtn = null;

  let store = { version: 1, activeMissionId: null, missions: [] };
  let sarModeActive = false;
  let panelState = null;
  let drawState = null;
  let pendingPointRole = null;
  /** Équipe DF en attente de placement carte (section Équipes). */
  let pendingTeamStationId = null;
  let pendingBearingPick = null;

  const DEFAULT_AERONEF_DF_TEAMS = ['Alpha', 'Bravo', 'Charlie'];
  /** Position par défaut SDIS 42 (Saint-Étienne) — stations DF des équipes. */
  const DEFAULT_SDIS_42 = { lat: 45.46539, lon: 4.38530 };
  /** Décalages légers entre marqueurs Alpha / Bravo / Charlie. */
  const DEFAULT_TEAM_STATION_OFFSETS = [
    { dLat: 0, dLon: 0 },
    { dLat: 0.00028, dLon: 0.00032 },
    { dLat: -0.00028, dLon: 0.00032 }
  ];
  /** Contexte X,Y,Z capturé au clic carte pour le relevé en cours (panneau ouvert). */
  let bearingClickContext = null;
  /** Contexte capturé au clic pick, consommé à l'ouverture du panneau. */
  let pendingBearingClickContext = null;
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
        let defaultDataAdded = false;
        store.missions.forEach((m) => {
          ensureMissionTeams(m);
          if (ensureDefaultAeronefTeams(m)) defaultDataAdded = true;
          if (ensureDefaultAeronefStations(m)) defaultDataAdded = true;
          ensureMissionFeatures(m);
          ensureMissionStatus(m);
        });
        if (defaultDataAdded) saveStore();
        if (store.missions.some((m) => repairBearingGeometries(m))) {
          saveStore();
        }
        if (typeof data.sarModeActive === 'boolean') {
          sarModeActive = data.sarModeActive;
        } else if (store.activeMissionId) {
          const m = getMission(store.activeMissionId);
          if (m && missionFeaturesList(m).length > 0) {
            sarModeActive = true;
          }
        }
        resolveActiveMissionId();
        if (sarModeActive && !missionCanEdit(getActiveMission())) {
          sarModeActive = false;
        }
      }
    } catch (err) {
      console.warn('Missions SAR : stockage invalide', err);
    }
  }

  function resolveActiveMissionId() {
    if (store.activeMissionId && getMission(store.activeMissionId)) return;
    store.activeMissionId = null;
    if (store.missions.length === 1) {
      store.activeMissionId = store.missions[0].id;
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: store.version,
      activeMissionId: store.activeMissionId,
      missions: store.missions,
      sarModeActive
    }));
  }

  function getMission(id) {
    return store.missions.find((m) => m.id === id) || null;
  }

  function getActiveMission() {
    if (!store.activeMissionId) return null;
    return getMission(store.activeMissionId);
  }

  function ensureMissionTeams(mission) {
    if (!mission) return;
    if (!Array.isArray(mission.teams)) mission.teams = [];
  }

  /** Mission aéronef sans équipes : Alpha, Bravo, Charlie (stations DF par défaut). */
  function ensureDefaultAeronefTeams(mission) {
    if (!mission || mission.type !== 'aeronef') return false;
    ensureMissionTeams(mission);
    if (mission.teams.length > 0) return false;
    DEFAULT_AERONEF_DF_TEAMS.forEach((name) => {
      mission.teams.push({
        id: newId(),
        name,
        created_at: new Date().toISOString()
      });
    });
    return true;
  }

  function teamStationOffset(index) {
    const o = DEFAULT_TEAM_STATION_OFFSETS[index % DEFAULT_TEAM_STATION_OFFSETS.length];
    return o || { dLat: 0, dLon: 0 };
  }

  function buildDefaultStationFeature(mission, team, lat, lon) {
    const teamProps = resolveTeamProps(mission, team.id);
    const props = T.buildFeatureProps(mission, 'station_df', {
      id: newId(),
      label: team.name,
      notes: '',
      created_at: new Date().toISOString(),
      ...teamProps
    });
    enrichLocationProps(props, lat, lon);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: props
    };
  }

  /** Stations DF au SDIS 42 pour chaque équipe sans station (création / migration). */
  function ensureDefaultAeronefStations(mission, opts) {
    opts = opts || {};
    if (!mission || mission.type !== 'aeronef') return false;
    if (!opts.force && mission.default_stations_at_sdis42) return false;
    ensureMissionTeams(mission);
    ensureMissionFeatures(mission);
    const teams = getMissionTeams(mission);
    if (!teams.length) return false;
    let changed = false;
    let placeIndex = 0;
    teams.forEach((team) => {
      if (findStationForTeam(mission, team.id)) return;
      const off = teamStationOffset(placeIndex++);
      const lat = DEFAULT_SDIS_42.lat + off.dLat;
      const lon = DEFAULT_SDIS_42.lon + off.dLon;
      mission.features.push(buildDefaultStationFeature(mission, team, lat, lon));
      changed = true;
    });
    if (changed) mission.default_stations_at_sdis42 = true;
    return changed;
  }

  function isStationPlaced(f) {
    if (!f || !isPointGeometry(f.geometry)) return false;
    const c = f.geometry.coordinates;
    return Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1]);
  }

  function collectStationDfFeatures(mission) {
    if (!mission) return [];
    ensureMissionFeatures(mission);
    const missionId = mission.id;
    const seen = new Set();
    const out = [];
    const addStation = (f) => {
      if (!f || !isStationDfFeature(f)) return;
      const key = stationFeatureKey(f);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(f);
    };
    missionFeaturesList(mission).forEach(addStation);
    stationFeaturesFromLayer(missionId).forEach(addStation);
    return out;
  }

  function findStationForTeam(mission, teamId) {
    if (!mission || !teamId) return null;
    return collectStationDfFeatures(mission).find((f) => {
      const p = f.properties || {};
      return p[T.PROP_TEAM_ID] === teamId;
    }) || null;
  }

  function getMissionTeams(mission) {
    ensureMissionTeams(mission);
    return mission.teams;
  }

  function findTeamById(mission, teamId) {
    if (!mission || !teamId) return null;
    return getMissionTeams(mission).find((t) => t.id === teamId) || null;
  }

  function addTeam(mission, name, notes) {
    if (!mission || !name) return null;
    ensureMissionTeams(mission);
    const team = {
      id: newId(),
      name: name.trim(),
      created_at: new Date().toISOString()
    };
    if (notes && notes.trim()) team.notes = notes.trim();
    mission.teams.push(team);
    saveStore();
    return team;
  }

  function deleteTeam(mission, teamId) {
    if (!mission || !teamId) return;
    ensureMissionTeams(mission);
    const station = findStationForTeam(mission, teamId);
    if (station && station.properties && station.properties.id) {
      deleteFeature(station.properties.id);
    }
    mission.teams = mission.teams.filter((t) => t.id !== teamId);
    saveStore();
    rebuildLayer();
    renderSidebar();
  }

  function resolveTeamProps(mission, teamId) {
    if (!teamId) return {};
    const team = findTeamById(mission, teamId);
    if (!team) return {};
    return {
      [T.PROP_TEAM_ID]: team.id,
      [T.PROP_TEAM_NAME]: team.name
    };
  }

  function readPanelTeamId() {
    return panelTeamEl ? (panelTeamEl.value || '') : '';
  }

  function populateTeamSelect(mission, selectedTeamId, showForRole, lockTeam) {
    if (!panelTeamFieldsEl || !panelTeamEl) return;
    const teams = getMissionTeams(mission);
    const show = teams.length > 0 && showForRole && !lockTeam;
    panelTeamFieldsEl.hidden = !show;
    if (!show) return;
    panelTeamEl.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '— Non assignée —';
    panelTeamEl.appendChild(optNone);
    teams.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      panelTeamEl.appendChild(opt);
    });
    panelTeamEl.value = selectedTeamId || '';
  }

  function missionCanEdit(mission) {
    if (!mission) return false;
    if (mission.status === 'closed') return false;
    return true;
  }

  function ensureMissionStatus(mission) {
    if (!mission) return;
    if (mission.status !== 'active' && mission.status !== 'closed') {
      mission.status = 'active';
    }
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
    ensureMissionFeatures(mission);
    const features = missionFeaturesList(mission);
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

  /** Préfixe obligatoire : SAR + JJMMYYYY + _ (date locale). */
  function buildMissionNamePrefix(date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return 'SAR' + pad(d.getDate()) + pad(d.getMonth() + 1) + d.getFullYear() + '_';
  }

  function finalizeMissionName(raw, creationDate) {
    const prefix = buildMissionNamePrefix(creationDate || new Date());
    const suffix = (raw || '').trim().replace(/^SAR\d{8}_?/, '').trim();
    return suffix ? prefix + suffix : prefix + 'Mission';
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

  function isReciprocalProp(props) {
    if (!props) return false;
    const v = props[T.PROP_BEARING_RECIPROCAL];
    return v === true || v === 'true';
  }

  function isReceptionProp(props) {
    if (!props) return false;
    return !isReciprocalProp(props);
  }

  function bearingSeparationDeg(b1, b2) {
    const diff = Math.abs(((b2 - b1 + 360) % 360));
    return diff > 180 ? 360 - diff : diff;
  }

  /** Corrige les géométries de relèvement (origine = point de relevé, directions direct/arrière). */
  function repairBearingGeometries(mission) {
    if (!mission || mission.type !== 'aeronef') return false;
    ensureMissionFeatures(mission);
    const byGroup = new Map();
    mission.features.forEach((f) => {
      const p = f.properties || {};
      if (p[T.PROP_ROLE] !== 'relevement_df') return;
      const gid = p[T.PROP_BEARING_GROUP_ID];
      if (!gid) return;
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid).push(f);
    });
    let changed = false;
    byGroup.forEach((feats, gid) => {
      const reception = feats.find((f) => isReceptionProp(f.properties));
      const reciprocal = feats.find((f) => isReciprocalProp(f.properties));
      if (!reception || !reciprocal) return;
      const rp = reception.properties || {};
      const station = findStationById(mission, rp[T.PROP_STATION_ID]);
      if (!station || !station.geometry || !station.geometry.coordinates) return;
      const relevePoint = findRelevePointInGroup(mission, gid);
      const origin = resolveBearingOrigin(relevePointToTargetCtx(relevePoint), station);
      if (!origin) return;
      const az = T.normalizeAzimuth(rp[T.PROP_AZIMUTH]);
      const range = Math.max(0.1, Number(rp[T.PROP_RANGE_KM]) || T.DEFAULT_RANGE_KM);
      const rc = reception.geometry && reception.geometry.coordinates;
      const pc = reciprocal.geometry && reciprocal.geometry.coordinates;
      let needsRepair = !rc || !pc || rc.length < 2 || pc.length < 2;
      if (!needsRepair) {
        const startOk = Math.abs(rc[0][0] - origin.lon) < 1e-5 && Math.abs(rc[0][1] - origin.lat) < 1e-5 &&
          Math.abs(pc[0][0] - origin.lon) < 1e-5 && Math.abs(pc[0][1] - origin.lat) < 1e-5;
        const bRec = T.initialBearing(origin.lat, origin.lon, rc[1][1], rc[1][0]);
        const bRep = T.initialBearing(origin.lat, origin.lon, pc[1][1], pc[1][0]);
        needsRepair = !startOk ||
          Math.abs(bRec - az) > 0.5 ||
          Math.abs(bRep - T.reciprocalAzimuth(az)) > 0.5 ||
          Math.abs(bearingSeparationDeg(bRec, bRep) - 180) > 0.5;
      }
      if (!needsRepair) return;
      reception.geometry = {
        type: 'LineString',
        coordinates: T.buildBearingLineFeature(origin.lat, origin.lon, az, range, false)
      };
      reciprocal.geometry = {
        type: 'LineString',
        coordinates: T.buildBearingLineFeature(origin.lat, origin.lon, az, range, true)
      };
      reciprocal.properties[T.PROP_AZIMUTH] = T.reciprocalAzimuth(az);
      changed = true;
    });
    return changed;
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
      if (isReciprocalProp(p)) return;
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
        stationLabel: (station.properties && station.properties.label) || 'Station DF',
        teamId: p[T.PROP_TEAM_ID] || null,
        teamName: p[T.PROP_TEAM_NAME] || null
      });
    });
    return out;
  }

  function clearBearingClickContexts() {
    bearingClickContext = null;
    pendingBearingClickContext = null;
  }

  function bearingClickInputLatLng(clickContext) {
    if (!clickContext) return null;
    if (clickContext.latlng) return clickContext.latlng;
    if (clickContext.lat == null) return null;
    const lon = clickContext.lon != null ? clickContext.lon : clickContext.lng;
    if (lon == null) return null;
    return L.latLng(clickContext.lat, lon);
  }

  function captureBearingTargetContext(latlng) {
    if (!latlng) return null;
    const lat = latlng.lat;
    const lon = latlng.lng;
    let alt = null;
    if (getElevationFn) {
      try {
        alt = getElevationFn(lat, lon);
      } catch (e) { /* ignore */ }
    }
    return { lat, lon, alt, latlng: L.latLng(lat, lon) };
  }

  function snapshotLatLng(latlng) {
    if (!latlng) return null;
    return L.latLng(latlng.lat, latlng.lng);
  }

  function getGlobalRightClickLatLng() {
    const fn = global.getLastRightClickLatLng;
    if (typeof fn !== 'function') return null;
    return fn();
  }

  function adoptBearingClickContext(clickContext) {
    if (clickContext != null) {
      pendingBearingClickContext = null;
      bearingClickContext = captureBearingTargetContext(bearingClickInputLatLng(clickContext));
      return bearingClickContext;
    }
    if (pendingBearingClickContext != null) {
      bearingClickContext = pendingBearingClickContext;
      pendingBearingClickContext = null;
      return bearingClickContext;
    }
    bearingClickContext = null;
    return null;
  }

  function computeBearingDefaults(station, targetCtx) {
    if (!station || !targetCtx || !station.geometry || !station.geometry.coordinates) return null;
    const sc = station.geometry.coordinates;
    const stationLat = sc[1];
    const stationLon = sc[0];
    const azimuth = T.initialBearing(stationLat, stationLon, targetCtx.lat, targetCtx.lon);
    let rangeKm = T.DEFAULT_RANGE_KM;
    const distM = L.latLng(stationLat, stationLon).distanceTo(L.latLng(targetCtx.lat, targetCtx.lon));
    if (distM > 10) {
      rangeKm = Math.max(0.1, Math.round(distM / 100) / 10);
    }
    return { azimuth, rangeKm };
  }

  /** Point de relevé figé à l'ouverture du panneau (ajout uniquement). */
  function getBearingTargetContext() {
    if (!panelState || panelState.mode !== 'addBearing') return null;
    return panelState.bearingTarget || null;
  }

  function renderBearingTargetInfo(ctx) {
    if (!panelBearingTargetEl) return;
    if (!ctx) {
      panelBearingTargetEl.hidden = true;
      panelBearingTargetEl.innerHTML = '';
      return;
    }
    panelBearingTargetEl.hidden = false;
    const lines = formatCoordsLines(ctx.lat, ctx.lon);
    if (ctx.alt != null) lines.push('Alt. : ' + ctx.alt + ' m');
    panelBearingTargetEl.innerHTML =
      '<p class="situation-hint">Point de relevé (position du clic)</p>' +
      lines.map((l) => '<div class="coords-line">' + escapeHtml(l) + '</div>').join('');
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
    if (roleId === 'relevement_df' && props && isReciprocalProp(props)) {
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
    if (isReciprocalProp(props)) {
      html += '<i>Signal arrière (trait pointillé)</i><br>';
    } else if (props[T.PROP_BEARING_RECIPROCAL] === false) {
      html += '<i>Signal direct (trait plein)</i><br>';
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
    if (props[T.PROP_TEAM_NAME]) {
      html += '<b>Équipe :</b> ' + escapeHtml(props[T.PROP_TEAM_NAME]) + '<br>';
    }
    if (props[T.PROP_ELEVATION_M] != null) {
      html += '<b>Altitude :</b> ' + escapeHtml(String(props[T.PROP_ELEVATION_M])) + ' m<br>';
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

  /** Horodatage local pour noms de fichiers export (YYYYMMDD_HHMMSS). */
  function formatExportDateHeure(d) {
    d = d || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function missionFeaturesList(mission) {
    if (!mission) return [];
    const feats = mission.features;
    if (Array.isArray(feats)) return feats;
    if (feats && Array.isArray(feats.features)) return feats.features;
    return [];
  }

  function ensureMissionFeatures(mission) {
    if (!mission) return;
    if (Array.isArray(mission.features)) return;
    if (mission.features && Array.isArray(mission.features.features)) {
      mission.features = mission.features.features;
      return;
    }
    mission.features = [];
  }

  function featureRoleId(props) {
    if (!props) return '';
    return props[T.PROP_ROLE] || props.role || '';
  }

  function isPointGeometry(geom) {
    if (!geom) return false;
    if (geom.type) {
      const t = String(geom.type);
      if (t === 'Point' || t === 'point') return true;
    }
    const c = geom.coordinates;
    return Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number';
  }

  function isStationDfFeature(f) {
    if (!f || !isPointGeometry(f.geometry)) return false;
    return featureRoleId(f.properties) === 'station_df';
  }

  function isStationDfFeatureForMission(f, missionId, opts) {
    opts = opts || {};
    if (!isStationDfFeature(f)) return false;
    if (opts.trustMission) return true;
    const p = f.properties || {};
    if (missionId && p[T.PROP_MISSION_ID] && p[T.PROP_MISSION_ID] !== missionId) return false;
    return true;
  }

  function stationFeatureKey(f) {
    const id = f.properties && f.properties.id;
    if (id) return 'id:' + id;
    const c = f.geometry && f.geometry.coordinates;
    return c ? 'c:' + JSON.stringify(c) : '';
  }

  function sarLayerGroupForMission(missionId) {
    const group = layersRef && layersRef[LAYER_NAME];
    if (!group) return null;
    const layerMid = group._cartoffSarMissionId;
    if (layerMid != null && layerMid !== missionId) return null;
    return group;
  }

  function stationFeaturesFromLayer(missionId) {
    const out = [];
    const seen = new Set();
    const group = sarLayerGroupForMission(missionId);
    if (!group) return out;
    group.eachLayer((layer) => {
      const feat = layer._cartoffSarFeature;
      if (!feat || !isStationDfFeature(feat)) return;
      const key = stationFeatureKey(feat);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(feat);
    });
    return out;
  }

  /** Réaligne mission.features sur les marqueurs station visibles du calque SAR. */
  function syncMissionStationsFromLayer(mission) {
    if (!mission || !mission.id) return false;
    const layerStations = stationFeaturesFromLayer(mission.id);
    if (!layerStations.length) return false;
    ensureMissionFeatures(mission);
    const seen = new Set();
    missionFeaturesList(mission).forEach((f) => {
      if (!isStationDfFeature(f)) return;
      const key = stationFeatureKey(f);
      if (key) seen.add(key);
    });
    let changed = false;
    layerStations.forEach((f) => {
      const key = stationFeatureKey(f);
      if (!key || seen.has(key)) return;
      seen.add(key);
      const p = f.properties || {};
      if (mission.id && !p[T.PROP_MISSION_ID]) {
        p[T.PROP_MISSION_ID] = mission.id;
      }
      mission.features.push(f);
      changed = true;
    });
    if (changed) saveStore();
    return changed;
  }

  function debugStationDiscovery(mission, context) {
    const mid = mission && mission.id;
    const group = layersRef && layersRef[LAYER_NAME];
    const feats = mission ? missionFeaturesList(mission) : [];
    const inFeatures = feats.filter(isStationDfFeature);
    const fromLayer = mid ? stationFeaturesFromLayer(mid) : [];
    const layerStationIds = [];
    if (group) {
      group.eachLayer((layer) => {
        const feat = layer._cartoffSarFeature;
        if (feat && isStationDfFeature(feat)) {
          layerStationIds.push((feat.properties && feat.properties.id) || stationFeatureKey(feat));
        }
      });
    }
    console.warn('[CartoffSar] ' + (context || 'station discovery'), {
      activeMissionId: store.activeMissionId,
      missionId: mid,
      missionType: mission && mission.type,
      sarModeActive,
      featuresIsArray: !!(mission && Array.isArray(mission.features)),
      stationsInMissionFeatures: inFeatures.length,
      stationsFromLayer: fromLayer.length,
      layerMissionId: group && group._cartoffSarMissionId,
      layerOnMap: !!(group && map && map.hasLayer(group)),
      layerStationIds,
      pendingStationDraft: !!(panelState && panelState.mode === 'add' && panelState.roleId === 'station_df'),
      panelStateMissionId: panelState && panelState.missionId
    });
  }

  function stationFeatures(mission) {
    return collectStationDfFeatures(mission).filter(isStationPlaced);
  }

  function resolveStationsForReleveDf(mission) {
    if (!mission) return [];
    ensureMissionFeatures(mission);
    rebuildLayer();
    syncMissionStationsFromLayer(mission);
    return stationFeatures(mission);
  }

  /** Alerte : stations DF non positionnées (section Équipes). */
  function alertNoStationDf(mission) {
    const teams = getMissionTeams(mission);
    const placed = stationFeatures(mission);
    const unplaced = teams.filter((t) => !isStationPlaced(findStationForTeam(mission, t.id)));
    if (teams.length && !placed.length) {
      const names = unplaced.length ? unplaced.map((t) => t.name).join(', ') : teams.map((t) => t.name).join(', ');
      alert('Aucune station DF positionnée sur la carte. Section Équipes → « Placer sur carte » pour : ' + names + '.');
      return;
    }
    if (unplaced.length) {
      alert('Stations non positionnées : ' + unplaced.map((t) => t.name).join(', ') +
        '. Section Équipes → « Placer sur carte ».');
      return;
    }
    alert('Aucune station DF positionnée. Section Équipes → placez les stations sur la carte.');
  }

  function findStationById(mission, stationId) {
    return stationFeatures(mission).find((f) => f.properties && f.properties.id === stationId) || null;
  }

  function findRelevePointInGroup(mission, groupId) {
    if (!mission || !groupId) return null;
    return (mission.features || []).find((f) => {
      const p = f.properties || {};
      return p[T.PROP_BEARING_GROUP_ID] === groupId && p[T.PROP_ROLE] === 'releve_point';
    }) || null;
  }

  function relevePointToTargetCtx(feature) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
    const c = feature.geometry.coordinates;
    const p = feature.properties || {};
    return {
      lat: c[1],
      lon: c[0],
      alt: p[T.PROP_ELEVATION_M] != null ? p[T.PROP_ELEVATION_M] : null,
      latlng: L.latLng(c[1], c[0])
    };
  }

  function resolveBearingOrigin(targetCtx, stationFeature) {
    if (targetCtx && targetCtx.lat != null && targetCtx.lon != null) {
      return { lat: targetCtx.lat, lon: targetCtx.lon };
    }
    if (stationFeature && stationFeature.geometry && stationFeature.geometry.coordinates) {
      const c = stationFeature.geometry.coordinates;
      return { lat: c[1], lon: c[0] };
    }
    return null;
  }

  function getBearingOriginForPanel(mission) {
    if (!panelState || !mission) return null;
    if (panelState.mode === 'addBearing') {
      const ctx = getBearingTargetContext();
      if (ctx && ctx.lat != null) return { lat: ctx.lat, lon: ctx.lon };
      return null;
    }
    if (panelState.mode === 'editBearing' && panelState.bearingGroupId) {
      const rp = findRelevePointInGroup(mission, panelState.bearingGroupId);
      if (rp && rp.geometry && rp.geometry.coordinates) {
        const c = rp.geometry.coordinates;
        return { lat: c[1], lon: c[0] };
      }
      const station = findStationById(mission, panelState.stationId);
      return resolveBearingOrigin(null, station);
    }
    return null;
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
    if (panelDfFieldsEl) {
      panelDfFieldsEl.hidden = !isStation;
      if (isStation) panelDfFieldsEl.removeAttribute('hidden');
      else panelDfFieldsEl.setAttribute('hidden', '');
    }
    if (panelBearingFieldsEl) {
      panelBearingFieldsEl.hidden = !isBearing;
      if (isBearing) panelBearingFieldsEl.removeAttribute('hidden');
      else panelBearingFieldsEl.setAttribute('hidden', '');
    }
  }

  function updatePanelTeamSelect(mission, roleId, panelKind, teamId, lockTeam) {
    const showTeam = (roleId === 'station_df' || panelKind === 'station' ||
      roleId === 'relevement_df' || panelKind === 'bearing');
    populateTeamSelect(mission, teamId, showTeam, lockTeam);
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
      let clickLatlng = clickLatLng;
      if (!clickLatlng && map) {
        try { clickLatlng = map.mouseEventToLatLng(domEvent); } catch (e) { /* ignore */ }
      }
      let latlng = layer.getLatLng ? layer.getLatLng() : null;
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
      openFeatureContextMenu(domEvent.clientX, domEvent.clientY, feature, mission, latlng, clickLatlng);
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
    const wasVisible = sarModeActive && map && layersRef && layersRef[LAYER_NAME] && map.hasLayer(layersRef[LAYER_NAME]);

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

    const shouldShow = wasVisible || sarModeActive;
    if (shouldShow && map) {
      newLayer.addTo(map);
    }
    if (updateLegendFn) updateLegendFn();
  }

  function renderSidebar() {
    if (!sidebarEl) return;
    const mission = getActiveMission();
    const canEdit = missionCanEdit(mission);

    let html = '<p class="situation-hint" id="sarHint">';
    if (!mission) {
      if (store.missions.length) {
        html += 'Sélectionnez une mission dans « Mission active », puis cochez Mode SAR.';
      } else {
        html += 'Créez une mission puis activez le mode SAR pour saisir des éléments.';
      }
    } else if (!canEdit) {
      html += 'Mission clôturée — consultation uniquement. Réactivez la mission pour modifier.';
    } else if (sarModeActive) {
      if (mission && mission.type === 'aeronef') {
        html += 'Mode SAR actif : stations DF (section Équipes), relèvements via clic droit carte.';
      } else {
        html += 'Mode SAR actif : clic droit sur la carte ou outils ci-dessous.';
      }
    } else if (mission && mission.type === 'aeronef') {
      html += 'Cochez « Mode SAR » pour relèvements (clic droit) et repositionner les stations DF.';
    } else {
      html += 'Cochez « Mode SAR » pour saisir LKP, indices, tracés…';
    }
    html += '</p>';

    html += '<span class="sar-draw-label">Mission</span>';
    html += '<div class="sar-mission-form">';
    html += '<label>Nouvelle mission<input type="text" id="sarNewMissionName" placeholder="Ex. Personne disparue secteur X" maxlength="80"></label>';
    html += '<p class="situation-hint sar-mission-name-hint">Le préfixe SAR + date du jour sera ajouté à la création.</p>';
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
      if (!store.activeMissionId) {
        html += '<option value="" selected>— Sélectionner une mission —</option>';
      }
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

    if (mission) {
      ensureMissionTeams(mission);
      if (mission.type === 'aeronef') {
        ensureDefaultAeronefTeams(mission);
        ensureDefaultAeronefStations(mission);
      }
      const teams = getMissionTeams(mission);
      html += '<div class="sar-teams-panel">';
      html += '<span class="sar-draw-label">Équipes</span>';
      if (mission.type === 'aeronef') {
        html += '<p class="situation-hint sar-teams-df-hint">Équipes DF — stations par défaut au SDIS 42. « Placer sur carte » pour repositionner.</p>';
      }
      if (canEdit) {
        html += '<div class="sar-team-add">';
        html += '<input type="text" id="sarNewTeamName" placeholder="Ex. Équipe DF Roanne" maxlength="80">';
        html += '<button type="button" id="sarAddTeamBtn" class="situation-btn">Ajouter équipe</button>';
        html += '</div>';
      }
      if (!teams.length) {
        html += '<p class="situation-hint">Aucune équipe — créez-les au fil de la session.</p>';
      } else {
        html += '<ul class="sar-team-list">';
        teams.forEach((t) => {
          const station = findStationForTeam(mission, t.id);
          const placed = isStationPlaced(station);
          html += '<li class="sar-team-row">';
          html += '<span class="sar-team-name">' + escapeHtml(t.name) + '</span>';
          if (mission.type === 'aeronef') {
            if (placed) {
              html += '<span class="sar-team-station-status" title="Station positionnée">● carte</span>';
            } else {
              html += '<span class="sar-team-station-status sar-team-station-missing" title="Non positionnée">○</span>';
            }
          }
          if (canEdit && mission.type === 'aeronef') {
            const placeLabel = placed ? 'Repositionner' : 'Placer sur carte';
            html += '<button type="button" class="situation-btn sar-team-place-btn" data-team-id="' +
              escapeHtml(t.id) + '">' + placeLabel + '</button>';
          }
          if (canEdit) {
            html += '<button type="button" class="situation-btn sar-team-delete-btn" data-team-id="' +
              escapeHtml(t.id) + '" title="Supprimer">✕</button>';
          }
          html += '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    }

    html += '<label class="situation-filter"><input type="checkbox" id="sarModeCheckbox"' +
      (sarModeActive ? ' checked' : '') +
      (mission && canEdit ? '' : ' disabled') +
      '> Mode SAR</label>';
    if (!mission && store.missions.length) {
      html += '<p class="situation-hint sar-mode-hint">Mode SAR disponible après sélection d\'une mission active.</p>';
    } else if (mission && !canEdit) {
      html += '<p class="situation-hint sar-mode-hint">Réactivez la mission pour activer le mode SAR.</p>';
    }

    if (mission && canEdit && sarModeActive) {
      if (mission.type !== 'aeronef') {
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

      if (hasFix && sarModeActive) {
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
        html += '<p class="situation-hint sar-intersection-hint">Activez le mode SAR pour choisir les fixes visibles.</p>';
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
    if (global.CartoffSarOperation) {
      global.CartoffSarOperation.updateVisibility(sarModeActive);
    }
  }

  let sidebarDelegationWired = false;

  function wireSidebarDelegation() {
    if (sidebarDelegationWired || !sidebarEl) return;
    sidebarDelegationWired = true;
    sidebarEl.addEventListener('change', (e) => {
      if (e.target.id !== 'sarModeCheckbox') return;
      if (e.target.checked) {
        let mission = getActiveMission();
        if (!mission) {
          const sel = document.getElementById('sarMissionSelect');
          if (sel && sel.value && getMission(sel.value)) {
            store.activeMissionId = sel.value;
            mission = getMission(sel.value);
          }
        }
        if (!missionCanEdit(mission)) {
          e.target.checked = false;
          return;
        }
      }
      sarModeActive = e.target.checked;
      cancelInteractions();
      saveStore();
      rebuildLayer();
      renderSidebar();
    });
  }

  function setSarModeActive(enabled) {
    sarModeActive = !!enabled;
    cancelInteractions();
    saveStore();
    rebuildLayer();
    renderSidebar();
  }

  function wireSidebarEvents() {
    const createBtn = document.getElementById('sarCreateMissionBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('sarNewMissionName');
        const typeEl = document.getElementById('sarNewMissionType');
        const type = (typeEl && typeEl.value) || 'personne';
        const mt = T.getMissionType(type);
        if (!mt || !mt.enabled) {
          alert('Ce type de mission n\'est pas encore disponible.');
          return;
        }
        const creationDate = new Date();
        const name = finalizeMissionName(nameEl && nameEl.value, creationDate);
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

    const addTeamBtn = document.getElementById('sarAddTeamBtn');
    if (addTeamBtn) {
      addTeamBtn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission || !missionCanEdit(mission)) return;
        const nameEl = document.getElementById('sarNewTeamName');
        const name = (nameEl && nameEl.value || '').trim();
        if (!name) {
          alert('Indiquez un nom d\'équipe.');
          return;
        }
        addTeam(mission, name);
        if (nameEl) nameEl.value = '';
        renderSidebar();
      });
    }

    document.querySelectorAll('.sar-team-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission || !missionCanEdit(mission)) return;
        const teamId = btn.getAttribute('data-team-id');
        const team = findTeamById(mission, teamId);
        if (!team) return;
        if (!confirm('Supprimer l\'équipe « ' + team.name + ' » ?')) return;
        deleteTeam(mission, teamId);
      });
    });

    document.querySelectorAll('.sar-team-place-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mission = getActiveMission();
        if (!mission || !missionCanEdit(mission) || mission.type !== 'aeronef') return;
        const teamId = btn.getAttribute('data-team-id');
        if (!findTeamById(mission, teamId)) return;
        startTeamStationPlaceMode(teamId);
      });
    });

    document.querySelectorAll('.sar-draw-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleId = btn.getAttribute('data-sar-role');
        const geom = btn.getAttribute('data-sar-geom');
        if (geom === 'point') startPointPickMode(roleId);
        else if (geom === 'line') startLineDrawMode(roleId);
        else if (geom === 'polygon') startPolygonDrawMode(roleId);
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
      features: [],
      teams: []
    };
    ensureMissionTeams(mission);
    if (mission.type === 'aeronef') {
      ensureDefaultAeronefTeams(mission);
      ensureDefaultAeronefStations(mission, { force: true });
    }
    store.missions.push(mission);
    store.activeMissionId = mission.id;
    sarModeActive = true;
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
    ensureMissionFeatures(mission);
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
      filename = 'sar_mission_' + safe + '_' + formatExportDateHeure() + '.geojson';
    } else {
      features = allFeatures();
      filename = 'sar_missions_' + formatExportDateHeure() + '.geojson';
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
        if (r.teamName) lines.push('   Équipe : ' + r.teamName);
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
      reception: { ...receptionBase, opacity: 0.55, pane: 'sarPane' },
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

  function applyBearingPreviewPolylines(receptionLatLngs, reciprocalLatLngs) {
    if (!bearingPreviewLayer) return;
    bearingPreviewLayer.eachLayer((layer) => {
      if (typeof layer.setLatLngs !== 'function') return;
      const isReciprocal = !!(layer.options && layer.options.dashArray);
      layer.setLatLngs(isReciprocal ? reciprocalLatLngs : receptionLatLngs);
    });
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
    const origin = getBearingOriginForPanel(mission);
    if (!origin) {
      removeBearingPreview();
      return;
    }
    const receptionCoords = T.buildBearingLineFeature(origin.lat, origin.lon, bearing.azimuth, bearing.rangeKm, false);
    const reciprocalCoords = T.buildBearingLineFeature(origin.lat, origin.lon, bearing.azimuth, bearing.rangeKm, true);
    const styles = bearingPreviewStyles();
    const receptionLatLngs = receptionCoords.map((c) => L.latLng(c[1], c[0]));
    const reciprocalLatLngs = reciprocalCoords.map((c) => L.latLng(c[1], c[0]));
    const targetCtx = panelState.mode === 'addBearing'
      ? getBearingTargetContext()
      : relevePointToTargetCtx(findRelevePointInGroup(mission, panelState.bearingGroupId));
    if (!bearingPreviewLayer) {
      const layers = [
        L.polyline(receptionLatLngs, styles.reception),
        L.polyline(reciprocalLatLngs, styles.reciprocal)
      ];
      if (targetCtx && targetCtx.latlng) {
        layers.push(L.marker(targetCtx.latlng, {
          icon: getMarkerIcon('releve_point', false),
          pane: 'sarPane',
          interactive: false
        }));
      }
      bearingPreviewLayer = L.layerGroup(layers, { pane: 'sarPane' }).addTo(map);
      return;
    }
    applyBearingPreviewPolylines(receptionLatLngs, reciprocalLatLngs);
    const layers = bearingPreviewLayer.getLayers();
    const markerLayer = layers.find((layer) => typeof layer.setLatLng === 'function' && typeof layer.setLatLngs !== 'function');
    if (targetCtx && targetCtx.latlng) {
      if (markerLayer) {
        markerLayer.setLatLng(targetCtx.latlng);
      } else {
        bearingPreviewLayer.addLayer(L.marker(targetCtx.latlng, {
          icon: getMarkerIcon('releve_point', false),
          pane: 'sarPane',
          interactive: false
        }));
      }
    } else if (markerLayer) {
      bearingPreviewLayer.removeLayer(markerLayer);
    }
  }

  function closePanel() {
    if (panelState && panelState.draftMarker && map) map.removeLayer(panelState.draftMarker);
    if (panelState && panelState.draftLayer && map) map.removeLayer(panelState.draftLayer);
    removeBearingPreview();
    clearBearingClickContexts();
    stopBearingPickMode();
    if (drawBannerEl) drawBannerEl.hidden = true;
    panelState = null;
    if (panelEl) panelEl.hidden = true;
    renderBearingTargetInfo(null);
  }

  function showPanel(opts) {
    if (!panelEl) return;
    dismissPanelOverlays();
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
    const mission = getMission(opts.missionId) || getActiveMission();
    updatePanelTeamSelect(mission, opts.roleId, panelKind, opts.teamId, opts.lockTeam);
    if (panelDeleteBtn) {
      panelDeleteBtn.hidden = opts.mode !== 'edit' && opts.mode !== 'editBearing';
    }
    if (!panelEl) return;
    panelEl.hidden = false;
    panelEl.removeAttribute('hidden');
    panelEl.style.display = 'block';
    panelEl.style.zIndex = '3300';
    const pos = clampPopupPosition(panelEl, opts.clientX, opts.clientY, 10);
    panelEl.style.left = pos.x + 'px';
    panelEl.style.top = pos.y + 'px';
    if (opts.panelKind === 'bearing' || opts.mode === 'addBearing' || opts.mode === 'editBearing') {
      let bearingTargetInfo = null;
      if (opts.mode === 'addBearing' && opts.bearingTarget) {
        bearingTargetInfo = opts.bearingTarget;
      } else if (opts.mode === 'editBearing' && mission && panelState && panelState.bearingGroupId) {
        bearingTargetInfo = relevePointToTargetCtx(findRelevePointInGroup(mission, panelState.bearingGroupId));
      }
      renderBearingTargetInfo(bearingTargetInfo);
      updateBearingPreview();
    } else {
      renderBearingTargetInfo(null);
      removeBearingPreview();
    }
  }

  function openPanelAdd(roleId, latlng, clientX, clientY, draftMarker, draftLayer, coordinates, geometryKind, presetTeamId) {
    closePanel();
    cancelDrawMode();
    pendingPointRole = null;
    pendingTeamStationId = null;
    if (map) {
      map.off('click', onPointPickClick);
    }
    const activeMission = getActiveMission();
    const lockTeam = !!presetTeamId;
    const team = presetTeamId && activeMission ? findTeamById(activeMission, presetTeamId) : null;
    panelState = {
      mode: 'add',
      roleId,
      missionId: activeMission ? activeMission.id : null,
      latlng,
      draftMarker: draftMarker || null,
      draftLayer: draftLayer || null,
      coordinates: coordinates || null,
      geometryKind: geometryKind || (coordinates ? 'line' : null),
      presetTeamId: presetTeamId || null
    };
    showPanel({
      mode: 'add',
      roleId,
      panelKind: roleId === 'station_df' ? 'station' : null,
      missionId: getActiveMission() && getActiveMission().id,
      clientX,
      clientY,
      created_at: roleId === 'station_df' ? new Date().toISOString() : undefined,
      teamId: presetTeamId || '',
      lockTeam,
      label: team && roleId === 'station_df' ? team.name : undefined
    });
  }

  function openPanelEdit(feature, mission, latlng, clientX, clientY) {
    closePanel();
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const groupId = bearingGroupIdFromProps(props);

    if (isBearingFeature(props) && groupId) {
      const groupFeats = featuresInBearingGroup(mission, groupId);
      const reception = groupFeats.find((f) => isReceptionProp(f.properties)) || feature;
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
        missionId: mission.id,
        label: rp.label || '',
        notes: rp.notes || '',
        azimuth: rp[T.PROP_AZIMUTH],
        rangeKm: rp[T.PROP_RANGE_KM],
        teamId: rp[T.PROP_TEAM_ID] || '',
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
      missionId: mission.id,
      label: props.label || '',
      notes: props.notes || '',
      created_at: props.created_at,
      teamId: props[T.PROP_TEAM_ID] || '',
      clientX,
      clientY
    });
  }

  /** Paire signal direct (plein) + arrière (pointillé) depuis le point de relevé. */
  function buildBearingFeaturePair(mission, stationFeature, azimuth, rangeKm, label, notes, groupId, createdAt, teamId, targetCtx) {
    const stationProps = stationFeature.properties || {};
    const stationId = stationProps.id;
    const origin = resolveBearingOrigin(targetCtx, stationFeature);
    if (!origin) return null;
    const az = T.normalizeAzimuth(azimuth);
    const range = Math.max(0.1, Number(rangeKm) || T.DEFAULT_RANGE_KM);
    const gid = groupId || newId();
    const ts = createdAt || new Date().toISOString();
    const baseLabel = label || ('Relèvement ' + az + '°');
    const teamProps = resolveTeamProps(mission, teamId);

    const receptionCoords = T.buildBearingLineFeature(origin.lat, origin.lon, az, range, false);
    const reciprocalCoords = T.buildBearingLineFeature(origin.lat, origin.lon, az, range, true);

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
        [T.PROP_BEARING_RECIPROCAL]: false,
        ...teamProps
      })
    };
    const reciprocal = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: reciprocalCoords },
      properties: T.buildFeatureProps(mission, 'relevement_df', {
        id: newId(),
        label: baseLabel + ' (signal arrière)',
        notes: notes || '',
        created_at: ts,
        [T.PROP_STATION_ID]: stationId,
        [T.PROP_BEARING_GROUP_ID]: gid,
        [T.PROP_AZIMUTH]: T.reciprocalAzimuth(az),
        [T.PROP_RANGE_KM]: range,
        [T.PROP_BEARING_RECIPROCAL]: true,
        ...teamProps
      })
    };
    enrichLocationProps(reception.properties, origin.lat, origin.lon);
    enrichLocationProps(reciprocal.properties, origin.lat, origin.lon);
    return { reception, reciprocal, groupId: gid };
  }

  function buildRelevePointFeature(mission, targetCtx, groupId, stationId, label, notes, createdAt, teamProps) {
    const props = T.buildFeatureProps(mission, 'releve_point', {
      id: newId(),
      label: label || 'Point de relevé',
      notes: notes || '',
      created_at: createdAt || new Date().toISOString(),
      [T.PROP_BEARING_GROUP_ID]: groupId,
      [T.PROP_STATION_ID]: stationId,
      ...(targetCtx.alt != null ? { [T.PROP_ELEVATION_M]: targetCtx.alt } : {}),
      ...teamProps
    });
    enrichLocationProps(props, targetCtx.lat, targetCtx.lon);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [targetCtx.lon, targetCtx.lat] },
      properties: props
    };
  }

  function persistBearingPair(mission, stationFeature, azimuth, rangeKm, label, notes, groupId, createdAt, teamId, targetCtx) {
    ensureMissionFeatures(mission);
    let existingRelevePoint = null;
    if (groupId) {
      existingRelevePoint = (mission.features || []).find((f) => {
        const p = f.properties || {};
        return p[T.PROP_BEARING_GROUP_ID] === groupId && p[T.PROP_ROLE] === 'releve_point';
      }) || null;
    }
    const pair = buildBearingFeaturePair(
      mission, stationFeature, azimuth, rangeKm, label, notes, groupId, createdAt, teamId, targetCtx
    );
    if (!pair) return;
    if (groupId) {
      mission.features = (mission.features || []).filter((f) => {
        const p = f.properties || {};
        return p[T.PROP_BEARING_GROUP_ID] !== groupId;
      });
    }
    mission.features.push(pair.reception);
    mission.features.push(pair.reciprocal);
    if (targetCtx && targetCtx.lat != null && targetCtx.lon != null) {
      const stationProps = stationFeature.properties || {};
      const teamProps = resolveTeamProps(mission, teamId);
      mission.features.push(buildRelevePointFeature(
        mission, targetCtx, pair.groupId, stationProps.id, label, notes,
        pair.reception.properties.created_at, teamProps
      ));
    } else if (existingRelevePoint) {
      mission.features.push(existingRelevePoint);
    }
    saveStore();
    rebuildLayer();
    if (mission.type === 'aeronef') maybeAutoUpdateIntersection(mission);
    else renderSidebar();
  }

  function stationFeatureLabel(st) {
    const props = st.properties || {};
    if (props[T.PROP_TEAM_NAME]) return String(props[T.PROP_TEAM_NAME]).trim();
    return (props.label || 'Station DF').trim();
  }

  let bearingPickerDismissFn = null;

  function hideBearingStationPicker() {
    const picker = document.getElementById('sarBearingStationPicker');
    if (picker) picker.hidden = true;
    if (bearingPickerDismissFn) {
      document.removeEventListener('mousedown', bearingPickerDismissFn, true);
      bearingPickerDismissFn = null;
    }
  }

  function ensureBearingStationPickerEl() {
    let picker = document.getElementById('sarBearingStationPicker');
    if (picker) return picker;
    picker = document.createElement('div');
    picker.id = 'sarBearingStationPicker';
    picker.className = 'map-context-menu sar-bearing-station-picker';
    picker.hidden = true;
    document.body.appendChild(picker);
    return picker;
  }

  function dismissPanelOverlays() {
    hideBearingStationPicker();
  }

  function bindBearingPickerDismiss(picker) {
    if (bearingPickerDismissFn) {
      document.removeEventListener('mousedown', bearingPickerDismissFn, true);
    }
    bearingPickerDismissFn = (e) => {
      if (picker.hidden || picker.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.situation-panel')) return;
      if (e.target.closest && e.target.closest('.sar-bearing-station-picker')) return;
      hideBearingStationPicker();
    };
    if (!picker.hidden) {
      document.addEventListener('mousedown', bearingPickerDismissFn, true);
    }
  }

  function resolveReleveDfClickContext(clickContext) {
    if (clickContext != null) return clickContext;
    if (pendingBearingClickContext != null) return pendingBearingClickContext;
    const getTarget = global.getMapContextMenuClickTarget;
    if (typeof getTarget === 'function') {
      const target = getTarget();
      const clickLl = menuTargetClickLatLng(target);
      if (clickLl) return captureBearingTargetContext(clickLl);
    }
    const globalLl = getGlobalRightClickLatLng();
    if (globalLl) return captureBearingTargetContext(globalLl);
    return null;
  }

  function ensureBearingTargetContext(clickContext) {
    const resolved = resolveReleveDfClickContext(clickContext);
    if (!resolved) return null;
    if (resolved.lat != null && resolved.latlng) return resolved;
    return captureBearingTargetContext(bearingClickInputLatLng(resolved));
  }

  function beginReleveDfFromContext(clickContext, clientX, clientY, knownStationId) {
    hideBearingStationPicker();
    releveDfAfterTargetClick(clickContext, clientX, clientY, knownStationId);
  }

  function canOfferReleveDf() {
    if (!sarModeActive) return false;
    const mission = getActiveMission();
    if (!mission || mission.type !== 'aeronef') return false;
    return missionCanEdit(mission);
  }

  /** Entrée directe menu contextuel — lat/lng figés, ouvre toujours #sarPanel (ou sélecteur station). */
  function openReleveDfDirect(latlng, clientX, clientY, knownStationId) {
    let snap = null;
    if (latlng && latlng.lat != null && latlng.lng != null) {
      snap = snapshotLatLng(latlng);
    }
    if (!snap) snap = snapshotLatLng(getGlobalRightClickLatLng());
    invokeReleveDfFromMenu(clientX, clientY, knownStationId || null, snap);
  }

  /** Clic menu contextuel : latlng figé en closure, ouverture panneau synchrone. */
  function invokeReleveDfFromMenu(clientX, clientY, knownStationId, latlngSnapshot) {
    let clickContext = null;
    if (latlngSnapshot) {
      clickContext = captureBearingTargetContext(latlngSnapshot);
    }
    if (!clickContext) {
      clickContext = resolveReleveDfClickContext(null);
    }
    if (clickContext) pendingBearingClickContext = clickContext;
    beginReleveDfFromContext(clickContext, clientX, clientY, knownStationId);
  }

  function menuTargetClickLatLng(target) {
    if (!target) return null;
    return target.clickLatlng || target.latlng || null;
  }

  function resolveMenuClickLatLng(target, clickContext) {
    if (clickContext && clickContext.latlng) return snapshotLatLng(clickContext.latlng);
    const clickLl = menuTargetClickLatLng(target);
    if (clickLl) return snapshotLatLng(clickLl);
    return snapshotLatLng(getGlobalRightClickLatLng());
  }

  /** Après capture X,Y,Z : choisir la station si besoin, puis ouvrir le panneau. */
  function releveDfAfterTargetClick(clickContext, clientX, clientY, knownStationId) {
    const mission = getActiveMission();
    if (!mission || mission.type !== 'aeronef') return;
    if (!missionCanEdit(mission)) {
      alert('Mission non modifiable — réactivez-la pour saisir un relèvement.');
      return;
    }
    if (!sarModeActive) {
      alert('Activez le mode SAR pour saisir un relèvement DF.');
      return;
    }
    const ctx = ensureBearingTargetContext(clickContext);
    if (!ctx) {
      alert('Position du clic introuvable — recliquez sur la carte puis « Relevé DF ».');
      return;
    }
    const stations = resolveStationsForReleveDf(mission);
    if (!stations.length) {
      if (panelState && panelState.mode === 'add' && panelState.roleId === 'station_df') {
        debugStationDiscovery(mission, 'releveDf: station draft non enregistrée');
        alert('Enregistrez d\'abord la station DF ouverte (bouton Enregistrer).');
        return;
      }
      debugStationDiscovery(mission, 'releveDf: aucune station DF');
      alertNoStationDf(mission);
      return;
    }
    if (knownStationId) {
      openBearingPanel(knownStationId, clientX, clientY, null, ctx);
      return;
    }
    if (stations.length === 1) {
      const sid = stations[0].properties && stations[0].properties.id;
      openBearingPanel(sid, clientX, clientY, null, ctx);
      return;
    }
    showBearingStationPicker(clientX, clientY, ctx);
  }

  function showBearingStationPicker(clientX, clientY, clickContext) {
    const mission = getActiveMission();
    if (!mission || mission.type !== 'aeronef') return;
    const stations = stationFeatures(mission);
    if (!stations.length) return;
    if (stations.length === 1) {
      const sid = stations[0].properties && stations[0].properties.id;
      openBearingPanel(sid, clientX, clientY, null, clickContext);
      return;
    }
    const picker = ensureBearingStationPickerEl();
    picker.innerHTML = '';
    const section = document.createElement('div');
    section.className = 'map-context-menu-section';
    section.textContent = 'Choisir la station';
    picker.appendChild(section);
    stations.forEach((st) => {
      const sid = st.properties && st.properties.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-context-menu-item map-context-menu-submenu-item';
      btn.textContent = '- ' + stationFeatureLabel(st);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideBearingStationPicker();
        openBearingPanel(sid, clientX, clientY, null, clickContext);
      });
      picker.appendChild(btn);
    });
    picker.hidden = false;
    const pos = clampPopupPosition(picker, clientX, clientY, 8);
    picker.style.left = pos.x + 'px';
    picker.style.top = pos.y + 'px';
    bindBearingPickerDismiss(picker);
  }

  function appendReleveDfContextMenu(menuEl, addItem, mission, clientX, clientY, clickContext, target) {
    const latlngSnapshot = resolveMenuClickLatLng(target, clickContext);
    const cx = clientX;
    const cy = clientY;
    const snapLat = latlngSnapshot ? latlngSnapshot.lat : null;
    const snapLng = latlngSnapshot ? latlngSnapshot.lng : null;
    addItem('Relevé DF', () => {
      if (snapLat != null && snapLng != null) {
        openReleveDfDirect({ lat: snapLat, lng: snapLng }, cx, cy, null);
      } else {
        openReleveDfDirect(null, cx, cy, null);
      }
    });
  }

  function openBearingPanel(stationId, clientX, clientY, editGroupId, clickContext) {
    const mission = getActiveMission();
    if (!mission || !missionCanEdit(mission)) return;
    const station = findStationById(mission, stationId);
    if (!station) {
      alert('Station DF introuvable.');
      return;
    }
    stopBearingPickMode();
    dismissPanelOverlays();
    cancelDrawMode();
    pendingPointRole = null;

    const coords = station.geometry.coordinates;
    const latlng = L.latLng(coords[1], coords[0]);

    if (editGroupId) {
      clearBearingClickContexts();
      closePanel();
      const groupFeats = featuresInBearingGroup(mission, editGroupId);
      const reception = groupFeats.find((f) => isReceptionProp(f.properties));
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
        missionId: mission.id,
        label: rp.label || '',
        notes: rp.notes || '',
        azimuth: rp[T.PROP_AZIMUTH],
        rangeKm: rp[T.PROP_RANGE_KM],
        teamId: rp[T.PROP_TEAM_ID] || '',
        clientX,
        clientY
      });
      return;
    }

    const targetCtx = adoptBearingClickContext(clickContext);
    const prevPanel = panelState;
    if (prevPanel && prevPanel.draftMarker && map) map.removeLayer(prevPanel.draftMarker);
    if (prevPanel && prevPanel.draftLayer && map) map.removeLayer(prevPanel.draftLayer);
    removeBearingPreview();
    const stationProps = station.properties || {};
    const defaults = targetCtx ? computeBearingDefaults(station, targetCtx) : null;
    panelState = {
      mode: 'addBearing',
      stationId,
      missionId: mission.id,
      latlng,
      bearingTarget: targetCtx
    };
    showPanel({
      mode: 'addBearing',
      roleId: 'relevement_df',
      panelKind: 'bearing',
      missionId: mission.id,
      label: 'Relèvement DF',
      notes: '',
      azimuth: defaults ? defaults.azimuth : 0,
      rangeKm: defaults ? defaults.rangeKm : T.DEFAULT_RANGE_KM,
      teamId: stationProps[T.PROP_TEAM_ID] || '',
      bearingTarget: targetCtx,
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
    const teamId = readPanelTeamId();
    const groupId = panelState.mode === 'editBearing' ? panelState.bearingGroupId : null;
    let createdAt = null;
    if (panelState.mode === 'editBearing') {
      const groupFeats = featuresInBearingGroup(mission, groupId);
      const reception = groupFeats.find((f) => isReceptionProp(f.properties));
      createdAt = reception && reception.properties && reception.properties.created_at;
    }
    let targetCtx = null;
    if (panelState.mode === 'addBearing') {
      targetCtx = getBearingTargetContext();
    } else if (panelState.mode === 'editBearing' && groupId) {
      const groupFeats = featuresInBearingGroup(mission, groupId);
      const rpFeat = groupFeats.find((f) => (f.properties || {})[T.PROP_ROLE] === 'releve_point');
      targetCtx = relevePointToTargetCtx(rpFeat);
    }
    persistBearingPair(
      mission, station, bearing.azimuth, bearing.rangeKm, label, notes, groupId, createdAt, teamId,
      targetCtx
    );
    closePanel();
  }

  function savePanel() {
    if (!panelState) return;
    if (panelState.mode === 'addBearing' || panelState.mode === 'editBearing') {
      saveBearingPanel();
      return;
    }
    const mission = panelState.mode === 'add'
      ? (getMission(panelState.missionId) || getActiveMission())
      : (getMission(panelState.missionId) || getActiveMission());
    if (!mission || !missionCanEdit(mission)) return;
    ensureMissionFeatures(mission);

    const roleId = panelState.roleId;
    if (panelState.mode === 'add' && roleId === 'station_df' && mission.id !== store.activeMissionId) {
      store.activeMissionId = mission.id;
      saveStore();
    }

    const role = T.getRole(roleId);
    const inputLabel = (panelLabelEl && panelLabelEl.value || '').trim();
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
    const teamId = roleId === 'station_df'
      ? (panelState.presetTeamId || readPanelTeamId())
      : '';
    const teamProps = roleId === 'station_df' ? resolveTeamProps(mission, teamId) : {};
    const linkedTeam = teamId ? findTeamById(mission, teamId) : null;
    const effectiveLabel = inputLabel || (linkedTeam ? linkedTeam.name : '') || (role ? role.label : '');
    if (panelState.mode === 'edit') {
      const found = findFeature(panelState.featureId);
      const prev = (found && found.feature.properties) || {};
      props = T.buildFeatureProps(mission, roleId, {
        id: panelState.featureId,
        label: effectiveLabel,
        notes,
        created_at: prev.created_at || new Date().toISOString(),
        [T.PROP_AZIMUTH]: prev[T.PROP_AZIMUTH],
        [T.PROP_RANGE_KM]: prev[T.PROP_RANGE_KM],
        [T.PROP_BEARING_RECIPROCAL]: prev[T.PROP_BEARING_RECIPROCAL],
        ...teamProps
      });
      props.commune = prev.commune;
      props.dfci = prev.dfci;
    } else {
      props = T.buildFeatureProps(mission, roleId, { id: newId(), label: effectiveLabel, notes, ...teamProps });
    }
    const ts = parseDatetimeLocal(panelTimestampEl && panelTimestampEl.value);
    if (ts && roleId === 'station_df') props.created_at = ts;
    enrichLocationProps(props, lat, lon);

    const feature = { type: 'Feature', geometry, properties: props };
    persistFeature(mission, feature, panelState.mode, panelState.featureId);
    if (roleId === 'station_df') renderSidebar();
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
    if (pendingTeamStationId) {
      const teamId = pendingTeamStationId;
      pendingTeamStationId = null;
      map.off('click', onPointPickClick);
      map.getContainer().classList.remove('situation-line-drawing');
      if (drawBannerEl) drawBannerEl.hidden = true;
      const mission = getActiveMission();
      const team = mission ? findTeamById(mission, teamId) : null;
      if (!mission || !team) return;
      const existing = findStationForTeam(mission, teamId);
      const draftMarker = L.marker(e.latlng, {
        icon: getMarkerIcon('station_df', false),
        pane: 'sarPane',
        interactive: false
      }).addTo(map);
      if (existing && existing.properties && existing.properties.id && isStationPlaced(existing)) {
        if (panelState && panelState.draftMarker && map) map.removeLayer(panelState.draftMarker);
        panelState = {
          mode: 'edit',
          featureId: existing.properties.id,
          roleId: 'station_df',
          missionId: mission.id,
          latlng: e.latlng,
          draftMarker,
          presetTeamId: teamId
        };
        const ep = existing.properties || {};
        showPanel({
          mode: 'edit',
          roleId: 'station_df',
          panelKind: 'station',
          missionId: mission.id,
          label: ep.label || team.name,
          notes: ep.notes || '',
          created_at: ep.created_at,
          teamId,
          lockTeam: true,
          clientX: e.originalEvent.clientX,
          clientY: e.originalEvent.clientY
        });
      } else {
        openPanelAdd('station_df', e.latlng, e.originalEvent.clientX, e.originalEvent.clientY, draftMarker, null, null, null, teamId);
      }
      return;
    }
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

  function stopBearingPickMode() {
    if (map) {
      map.off('click', onBearingTargetPickClick);
      map.getContainer().classList.remove('situation-line-drawing');
    }
    pendingBearingPick = null;
  }

  function startBearingPickMode(stationId) {
    cancelDrawMode();
    closePanel();
    pendingPointRole = null;
    hideBearingStationPicker();
    clearBearingClickContexts();
    pendingBearingPick = stationId ? { stationId } : {};
    if (map) {
      map.off('click', onBearingTargetPickClick);
      map.getContainer().classList.add('situation-line-drawing');
      map.on('click', onBearingTargetPickClick);
    }
    if (drawBannerEl) {
      drawBannerEl.hidden = false;
      if (drawBannerTextEl) {
        drawBannerTextEl.textContent = stationId
          ? 'Cliquez le point visé sur la carte (station déjà choisie)'
          : 'Cliquez le point visé sur la carte (relèvement DF)';
      }
    }
  }

  function onBearingTargetPickClick(e) {
    if (!pendingBearingPick) return;
    const pickState = pendingBearingPick;
    const cx = e.originalEvent.clientX;
    const cy = e.originalEvent.clientY;
    stopBearingPickMode();
    beginReleveDfFromContext(e.latlng, cx, cy, pickState.stationId || null);
  }

  function startBearingFlow(stationId) {
    const mission = getActiveMission();
    if (!mission || mission.type !== 'aeronef') return;
    if (!missionCanEdit(mission)) {
      alert('Mission non modifiable — réactivez-la pour saisir un relèvement.');
      return;
    }
    if (!sarModeActive) {
      alert('Activez le mode SAR pour saisir un relèvement DF.');
      return;
    }
    dismissPanelOverlays();
    startBearingPickMode(stationId || null);
  }

  function startTeamStationPlaceMode(teamId) {
    const mission = getActiveMission();
    if (!mission || mission.type !== 'aeronef' || !missionCanEdit(mission) || !map) return;
    const team = findTeamById(mission, teamId);
    if (!team) return;
    cancelDrawMode();
    closePanel();
    pendingPointRole = null;
    pendingTeamStationId = teamId;
    map.getContainer().classList.add('situation-line-drawing');
    map.on('click', onPointPickClick);
    if (drawBannerEl) {
      drawBannerEl.hidden = false;
      if (drawBannerTextEl) {
        drawBannerTextEl.textContent = 'Placez la station « ' + team.name + ' » sur la carte';
      }
    }
  }

  function startPointPickMode(roleId) {
    const mission = getActiveMission();
    if (!missionCanEdit(mission) || !sarModeActive || !map) return;
    cancelDrawMode();
    closePanel();
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
    pendingTeamStationId = null;
    stopBearingPickMode();
    hideBearingStationPicker();
    if (map) {
      map.off('click', onPointPickClick);
      map.getContainer().classList.remove('situation-line-drawing');
    }
    if (drawBannerEl) drawBannerEl.hidden = true;
  }

  function openFeatureContextMenu(clientX, clientY, feature, mission, latlng, clickLatlng) {
    if (typeof global.openMapContextMenuForSar !== 'function') return;
    const geom = feature.geometry || {};
    global.openMapContextMenuForSar(clientX, clientY, {
      type: geom.type === 'LineString' ? 'line' : (geom.type === 'Polygon' ? 'polygon' : 'marker'),
      feature,
      latlng,
      clickLatlng: clickLatlng || latlng
    });
  }

  function buildMapContextMenu(menuEl, addItem, target, clientX, clientY, opts) {
    opts = opts || {};
    const hostEl = opts.hostEl || menuEl;
    if (!sarModeActive) return false;
    const mission = getActiveMission();
    if (!mission) return false;

    if (target.type === 'marker' || target.type === 'line' || target.type === 'polygon') {
      const feature = target.feature;
      if (feature && feature.properties && feature.properties[T.PROP_MISSION_ID]) {
        if (!opts.skipSection) {
          const section = document.createElement('div');
          section.className = 'map-context-menu-section';
          section.textContent = opts.sectionLabel || 'Mission SAR';
          menuEl.appendChild(section);
        }
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
            return true;
          }
          if (props[T.PROP_ROLE] === 'incertitude_fix') return false;
          if (featureRoleId(props) === 'station_df') {
            const latlngSnapshot = resolveMenuClickLatLng(target, null);
            const stationId = props.id || null;
            const cx = clientX;
            const cy = clientY;
            addItem('Relevé DF', () => {
              invokeReleveDfFromMenu(cx, cy, stationId, latlngSnapshot);
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
        return true;
      }
    }

    if (!missionCanEdit(mission)) return false;

    if (!opts.skipSection) {
      const section = document.createElement('div');
      section.className = 'map-context-menu-section';
      section.textContent = opts.sectionLabel || 'Mission SAR';
      menuEl.appendChild(section);
    }

    if (mission.type === 'aeronef') {
      if (!opts.skipReleveDf) {
        const clickLl = menuTargetClickLatLng(target);
        const clickCtx = clickLl ? captureBearingTargetContext(clickLl) : null;
        appendReleveDfContextMenu(hostEl, addItem, mission, clientX, clientY, clickCtx, target);
      }
      return true;
    }

    const addSubmenu = global.addMapContextMenuSubmenu;
    const pointRoles = T.pointRoles(mission.type);
    const lineRoles = T.lineRoles(mission.type);
    const polygonRoles = T.polygonRoles(mission.type);

    if (addSubmenu) {
      if (pointRoles.length) {
        addSubmenu(hostEl, 'Point', pointRoles.map((role) => ({
          label: role.label,
          onClick: () => {
            const draftMarker = L.marker(target.latlng, {
              icon: getMarkerIcon(role.id, false),
              pane: 'sarPane',
              interactive: false
            }).addTo(map);
            openPanelAdd(role.id, target.latlng, clientX, clientY, draftMarker);
          }
        })));
      }
      if (lineRoles.length) {
        addSubmenu(hostEl, 'Tronçon', lineRoles.map((role) => ({
          label: role.label,
          onClick: () => startLineDrawMode(role.id, target.latlng)
        })));
      }
      if (polygonRoles.length) {
        addSubmenu(hostEl, 'Surface', polygonRoles.map((role) => ({
          label: role.label,
          onClick: () => startPolygonDrawMode(role.id, target.latlng)
        })));
      }
      return !!(pointRoles.length || lineRoles.length || polygonRoles.length);
    }

    pointRoles.forEach((role) => {
      addItem(role.label, () => {
        const draftMarker = L.marker(target.latlng, {
          icon: getMarkerIcon(role.id, false),
          pane: 'sarPane',
          interactive: false
        }).addTo(map);
        openPanelAdd(role.id, target.latlng, clientX, clientY, draftMarker);
      });
    });
    lineRoles.forEach((role) => {
      addItem(role.label + ' (polyligne)', () => {
        startLineDrawMode(role.id, target.latlng);
      });
    });
    polygonRoles.forEach((role) => {
      addItem(role.label + ' (zone)', () => {
        startPolygonDrawMode(role.id, target.latlng);
      });
    });
    return !!(pointRoles.length || lineRoles.length || polygonRoles.length);
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
        const dash = role.id === 'relevement_df' ? ' (signal direct / arrière)' : '';
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

  let panelActionsWired = false;

  function wirePanelActions() {
    if (panelActionsWired || !panelEl) return;
    panelActionsWired = true;
    if (typeof global.setupFloatingPanelDrag === 'function' && panelTitleEl) {
      global.setupFloatingPanelDrag(panelEl, panelTitleEl);
    }
    const onSave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      savePanel();
    };
    const onCancel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    };
    const onDelete = (e) => {
      e.preventDefault();
      e.stopPropagation();
      deletePanelFeature();
    };
    panelEl.addEventListener('click', (e) => {
      if (e.target.closest('#sarPanelSave')) onSave(e);
      else if (e.target.closest('#sarPanelCancel')) onCancel(e);
      else if (e.target.closest('#sarPanelDelete')) onDelete(e);
    });
    if (panelSaveBtn) panelSaveBtn.addEventListener('click', onSave);
    if (panelCancelBtn) panelCancelBtn.addEventListener('click', onCancel);
    if (panelDeleteBtn) panelDeleteBtn.addEventListener('click', onDelete);
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

  function init(options) {
    map = options.map;
    layersRef = options.layers;
    updateLegendFn = options.updateLegend;
    findCommuneFn = options.findCommune || null;
    latLngToDfciFn = options.latLngToDfci || null;
    latLngToUtmFn = options.latLngToUtm || null;
    getElevationFn = options.getElevation || null;
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
    panelBearingTargetEl = options.panelBearingTargetEl || null;
    panelTeamFieldsEl = options.panelTeamFieldsEl;
    panelTeamEl = options.panelTeamEl;
    drawBannerEl = options.drawBannerEl;
    drawBannerTextEl = options.drawBannerTextEl;
    drawFinishBtn = options.drawFinishBtn;
    drawCancelBtn = options.drawCancelBtn;
    wirePanelActions();
    wireSidebarDelegation();

    loadStore();
    resolveActiveMissionId();
    let defaultDataAdded = false;
    store.missions.forEach((m) => {
      ensureMissionTeams(m);
      if (ensureDefaultAeronefTeams(m)) defaultDataAdded = true;
      if (ensureDefaultAeronefStations(m)) defaultDataAdded = true;
      ensureMissionFeatures(m);
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
    try {
      if (store.activeMissionId) rebuildLayer();
    } catch (err) {
      console.warn('Missions SAR : affichage du calque impossible', err);
    }
  }

  global.CartoffSar = {
    LAYER_NAME,
    STORAGE_KEY,
    init,
    isSarModeActive: () => sarModeActive,
    setSarModeActive,
    isDrawOrPanelActive: () => !!(drawState || panelState || pendingPointRole || pendingTeamStationId || pendingBearingPick),
    cancelInteractions,
    getFeatureFromDomEvent,
    buildMapContextMenu,
    getLegendHtml,
    exportGeoJSON,
    formatExportDateHeure,
    exportSarReport,
    buildSarReportText,
    computeAndApplyIntersection,
    getStore: () => store,
    canOfferReleveDf,
    openReleveDfDirect
  };
})(typeof window !== 'undefined' ? window : this);
