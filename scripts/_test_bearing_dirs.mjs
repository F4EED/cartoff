import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(__dirname, '../js/sar-types.js'), 'utf8');
const global = {};
eval(code.replace('typeof window !== \'undefined\' ? window : this', 'global'));
const T = global.CartoffSarTypes;

const O = { lat: 45.76, lon: 4.88 };
const az = 38.1;
const r = 30;

function bearingFromOrigin(coords) {
  return T.initialBearing(O.lat, O.lon, coords[1][1], coords[1][0]);
}

function assertOpposite(receptionCoords, reciprocalCoords, label) {
  const b1 = bearingFromOrigin(receptionCoords);
  const b2 = bearingFromOrigin(reciprocalCoords);
  const diff = Math.abs(((b2 - b1 + 360) % 360));
  const sep = diff > 180 ? 360 - diff : diff;
  if (Math.abs(sep - 180) > 0.2) {
    console.error(`FAIL ${label}: direct=${b1} arrière=${b2} separation=${sep}`);
    process.exit(1);
  }
}

function assertStartsAtOrigin(coords, label) {
  if (Math.abs(coords[0][0] - O.lon) > 1e-6 || Math.abs(coords[0][1] - O.lat) > 1e-6) {
    console.error(`FAIL ${label}: origin expected`, O, 'got', coords[0]);
    process.exit(1);
  }
}

const receptionNum = T.buildBearingLineFeature(O.lat, O.lon, az, r, false);
const reciprocalNum = T.buildBearingLineFeature(O.lat, O.lon, az, r, true);
assertStartsAtOrigin(receptionNum, 'reception');
assertStartsAtOrigin(reciprocalNum, 'arrière');
assertOpposite(receptionNum, reciprocalNum, 'number azimuth');
if (Math.abs(bearingFromOrigin(receptionNum) - az) > 0.2) {
  console.error('FAIL direct should point at', az, 'got', bearingFromOrigin(receptionNum));
  process.exit(1);
}

const receptionStr = T.buildBearingLineFeature(O.lat, O.lon, String(az), r, false);
const reciprocalStr = T.buildBearingLineFeature(O.lat, O.lon, String(az), r, true);
assertOpposite(receptionStr, reciprocalStr, 'string azimuth (panel input)');

console.log('OK bearing opposite directions: 38.1 / 218.1 from relevé point');
