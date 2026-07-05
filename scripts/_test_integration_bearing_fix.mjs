/**
 * 3 stations + clics éloignés : relevé au clic, fix SAR-3 à l'intersection station+azimut.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(__dirname, '../js/sar-types.js'), 'utf8');
const global = {};
eval(code.replace("typeof window !== 'undefined' ? window : this", 'global'));
const T = global.CartoffSarTypes;

const PROP_AZIMUTH = 'sar:azimuth';
const PROP_RANGE_KM = 'sar:range_km';
const PROP_STATION_ID = 'sar:station_id';
const PROP_BEARING_GROUP_ID = 'sar:bearing_group_id';
const PROP_BEARING_RECIPROCAL = 'sar:bearing_reciprocal';
const PROP_ROLE = 'sar:role';

function stationOrigin(station) {
  return { lat: station.lat, lon: station.lon };
}

function resolveBearingDisplayOrigin(station, targetCtx) {
  if (targetCtx && targetCtx.lat != null && targetCtx.lon != null) {
    return { lat: targetCtx.lat, lon: targetCtx.lon };
  }
  return stationOrigin(station);
}

function deriveReceptionAzimuth(receptionFeature, stationLat, stationLon) {
  const p = receptionFeature.properties || {};
  if (p[PROP_AZIMUTH] != null && isFinite(Number(p[PROP_AZIMUTH]))) {
    return T.normalizeAzimuth(p[PROP_AZIMUTH]);
  }
  const coords = receptionFeature.geometry && receptionFeature.geometry.coordinates;
  if (coords && coords.length >= 2) {
    const start = coords[0];
    const end = coords[coords.length - 1];
    if (Math.abs(start[0] - stationLon) < 1e-5 && Math.abs(start[1] - stationLat) < 1e-5) {
      return T.initialBearing(stationLat, stationLon, end[1], end[0]);
    }
  }
  return 0;
}

function buildPair(station, targetCtx, azimuth, rangeKm, groupId) {
  const displayOrigin = resolveBearingDisplayOrigin(station, targetCtx);
  const az = T.normalizeAzimuth(azimuth);
  const range = rangeKm || T.DEFAULT_RANGE_KM;
  const receptionCoords = T.buildBearingLineFeature(displayOrigin.lat, displayOrigin.lon, az, range, false);
  const reception = {
    geometry: { type: 'LineString', coordinates: receptionCoords },
    properties: {
      [PROP_ROLE]: 'relevement_df',
      [PROP_AZIMUTH]: az,
      [PROP_RANGE_KM]: range,
      [PROP_STATION_ID]: station.id,
      [PROP_BEARING_GROUP_ID]: groupId,
      [PROP_BEARING_RECIPROCAL]: false,
      created_at: new Date().toISOString()
    }
  };
  const relevePoint = targetCtx ? {
    geometry: { type: 'Point', coordinates: [targetCtx.lon, targetCtx.lat] },
    properties: { [PROP_ROLE]: 'releve_point', [PROP_BEARING_GROUP_ID]: groupId, [PROP_STATION_ID]: station.id }
  } : null;
  return { reception, relevePoint, displayOrigin };
}

function receptionBearings(mission) {
  const byStation = new Map();
  mission.features.forEach((f) => {
    const p = f.properties || {};
    if (p[PROP_ROLE] !== 'relevement_df') return;
    if (p[PROP_BEARING_RECIPROCAL] === true) return;
    const stationId = p[PROP_STATION_ID];
    const station = mission.stations[stationId];
    if (!station) return;
    const azimuth = deriveReceptionAzimuth(f, station.lat, station.lon);
    const entry = {
      stationId,
      groupId: p[PROP_BEARING_GROUP_ID],
      azimuth,
      stationLat: station.lat,
      stationLon: station.lon,
      created_at: p.created_at || ''
    };
    const prev = byStation.get(stationId);
    if (!prev || String(entry.created_at) > String(prev.created_at)) byStation.set(stationId, entry);
  });
  return Array.from(byStation.values());
}

function stationIntersection(a, b) {
  return T.intersectBearings(a.stationLat, a.stationLon, a.azimuth, b.stationLat, b.stationLon, b.azimuth);
}

const SDIS = { lat: 45.46539, lon: 4.38530 };
const OFFSETS = [{ dLat: 0, dLon: 0 }, { dLat: 0.036, dLon: 0.051 }, { dLat: 0.036, dLon: -0.051 }];
const target = { lat: 45.52, lon: 4.42 };
const CLICK_OFFSETS = [
  { dLat: 0.08, dLon: 0.06 },
  { dLat: 0.07, dLon: -0.05 },
  { dLat: -0.06, dLon: 0.04 }
];

const stations = {};
['Alpha', 'Bravo', 'Charlie'].forEach((id, i) => {
  stations[id] = { id, lat: SDIS.lat + OFFSETS[i].dLat, lon: SDIS.lon + OFFSETS[i].dLon };
});

const mission = { stations, features: [] };
const built = [];
['Alpha', 'Bravo', 'Charlie'].forEach((id, i) => {
  const st = stations[id];
  const clickFar = {
    lat: st.lat + CLICK_OFFSETS[i].dLat,
    lon: st.lon + CLICK_OFFSETS[i].dLon
  };
  const dfAz = T.initialBearing(st.lat, st.lon, target.lat, target.lon);
  const { reception, relevePoint, displayOrigin } = buildPair(st, clickFar, dfAz, 30, 'g' + i);
  mission.features.push(reception);
  if (relevePoint) mission.features.push(relevePoint);
  built.push({ reception, relevePoint, displayOrigin, station: st, clickFar });
});

for (const item of built) {
  const [rpLon, rpLat] = item.relevePoint.geometry.coordinates;
  const distToClick = Math.hypot(rpLat - item.clickFar.lat, rpLon - item.clickFar.lon);
  const distToStation = Math.hypot(rpLat - item.station.lat, rpLon - item.station.lon);
  if (distToClick > 0.0001 || distToStation < 0.01) {
    console.error('FAIL: releve point not at click or too close to station', item);
    process.exit(1);
  }
  const lineStart = item.reception.geometry.coordinates[0];
  if (Math.abs(lineStart[0] - item.clickFar.lon) > 1e-5 || Math.abs(lineStart[1] - item.clickFar.lat) > 1e-5) {
    console.error('FAIL: display line must start at releve click, not station', item);
    process.exit(1);
  }
}

const receptions = receptionBearings(mission);
const result = T.computeAllIntersections(receptions);

if (result.candidates.length !== 3) {
  console.error('FAIL: expected 3 candidates, got', result.candidates.length);
  process.exit(1);
}
if (!result.best || !result.best.isBest) {
  console.error('FAIL: no best fix');
  process.exit(1);
}

const errLat = Math.abs(result.best.lat - target.lat);
const errLon = Math.abs(result.best.lon - target.lon);
if (errLat > 0.002 || errLon > 0.002) {
  console.error('FAIL: best fix too far from target', result.best, target);
  process.exit(1);
}

const stationPairs = [[0, 1], [0, 2], [1, 2]];
for (const [i, j] of stationPairs) {
  const stationFix = stationIntersection(receptions[i], receptions[j]);
  const fix = result.candidates.find((c) => {
    const ids = c.stations.map((s) => s.stationId).sort().join('+');
    const want = [stations[['Alpha', 'Bravo', 'Charlie'][i]].id, stations[['Alpha', 'Bravo', 'Charlie'][j]].id].sort().join('+');
    return ids === want;
  });
  if (!stationFix || !fix) {
    console.error('FAIL: missing station intersection or fix for pair', i, j);
    process.exit(1);
  }
  const dLat = Math.abs(stationFix.lat - fix.lat);
  const dLon = Math.abs(stationFix.lon - fix.lon);
  if (dLat > 0.0002 || dLon > 0.0002) {
    console.error('FAIL: fix not at station-origin intersection', { stationFix, fix, dLat, dLon });
    process.exit(1);
  }
}

console.log('OK 3-station triangle: releve at click, fixes on station intersections, best near target, angle', result.best.qualityAngle + '°');
