/**
 * Alpha / Bravo / Charlie (SDIS 42) — intersection SAR-3 avec stations écartées (~4 km).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(__dirname, '../js/sar-types.js'), 'utf8');
const global = {};
eval(code.replace('typeof window !== \'undefined\' ? window : this', 'global'));
const T = global.CartoffSarTypes;

const SDIS = { lat: 45.46539, lon: 4.38530 };
const OFFSETS = [
  { dLat: 0, dLon: 0 },
  { dLat: 0.036, dLon: 0.051 },
  { dLat: 0.036, dLon: -0.051 }
];
const target = { lat: 45.5, lon: 4.45 };

const stations = ['Alpha', 'Bravo', 'Charlie'].map((id, i) => ({
  id,
  lat: SDIS.lat + OFFSETS[i].dLat,
  lon: SDIS.lon + OFFSETS[i].dLon
}));

const receptions = stations.map((s, i) => ({
  stationId: s.id,
  groupId: 'g' + i,
  azimuth: T.initialBearing(s.lat, s.lon, target.lat, target.lon),
  stationLat: s.lat,
  stationLon: s.lon
}));

const result = T.computeAllIntersections(receptions);
if (result.candidates.length < 2) {
  console.error('FAIL: expected at least 2 candidates, got', result.candidates.length);
  process.exit(1);
}
if (!result.best || !result.best.isBest) {
  console.error('FAIL: no best fix marked');
  process.exit(1);
}
const errLat = Math.abs(result.best.lat - target.lat);
const errLon = Math.abs(result.best.lon - target.lon);
if (errLat > 0.001 || errLon > 0.001) {
  console.error('FAIL: best fix too far from target', result.best, target);
  process.exit(1);
}
console.log('OK Alpha/Bravo/Charlie intersection:', result.candidates.length, 'candidates, best angle', result.best.qualityAngle + '°');
