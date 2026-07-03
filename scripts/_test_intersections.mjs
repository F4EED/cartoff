import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(__dirname, '../js/sar-types.js'), 'utf8');
const global = {};
// eslint-disable-next-line no-eval
eval(code.replace('typeof window !== \'undefined\' ? window : this', 'global'));
const T = global.CartoffSarTypes;

function run(label, receptions) {
  const result = T.computeAllIntersections(receptions);
  console.log(`\n${label}: ${result.candidates.length} candidate(s)`);
  result.candidates.forEach((c) => {
    const ids = c.stations.map((s) => s.stationId).join('+');
    console.log(`  Fix ${c.index}: ${ids} @ ${c.lat},${c.lon} angle=${c.qualityAngle}`);
  });
}

// Target at 45.76, 4.88 — bearings computed from stations toward target
const target = { lat: 45.76, lon: 4.88 };
const stations = [
  { id: 'A', lat: 45.75, lon: 4.85 },
  { id: 'B', lat: 45.75, lon: 4.91 },
  { id: 'C', lat: 45.78, lon: 4.88 },
];
const receptions = stations.map((s, i) => ({
  stationId: s.id,
  groupId: 'g' + i,
  azimuth: T.initialBearing(s.lat, s.lon, target.lat, target.lon),
  stationLat: s.lat,
  stationLon: s.lon,
}));
run('3 stations → même cible (cas SAR typique)', receptions);

run('3 stations géométrie simple', [
  { stationId: 'A', groupId: 'g1', azimuth: 45, stationLat: 45.75, stationLon: 4.85 },
  { stationId: 'B', groupId: 'g2', azimuth: 315, stationLat: 45.75, stationLon: 4.91 },
  { stationId: 'C', groupId: 'g3', azimuth: 225, stationLat: 45.78, stationLon: 4.88 },
]);
