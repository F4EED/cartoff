/* Utilitaires offline : UTM, DFCI, altitude, point dans polygone — voir sources.md */
(function (global) {
  if (typeof proj4 === 'undefined') return;

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const A_WGS = 6378137;
  const B_WGS = 6356752.314245179;
  const E_WGS = Math.sqrt(1 - (B_WGS / A_WGS) ** 2);
  const A_NTF = 6378249.2;
  const B_NTF = 6356515;
  const E_NTF = Math.sqrt(1 - (B_NTF / A_NTF) ** 2);
  const MERID_PARIS = 2.33722916666667;
  const L2E = { n: 0.7289686274, c: 11745793.39, xs: 600000, ys: 8199695.768 };

  function utmDefs(zone, north) {
    const code = `UTM:${zone}${north ? 'N' : 'S'}`;
    if (!proj4.defs(code)) {
      proj4.defs(code,
        `+proj=utm +zone=${zone} ${north ? '' : '+south '}+datum=WGS84 +units=m +no_defs`);
    }
    return code;
  }

  function latIsom(latDeg, ecc) {
    const latRad = latDeg * DEG2RAD;
    let s = ecc * Math.sin(latRad);
    s = (1 - s) / (1 + s);
    s = Math.log(s) * (ecc / 2);
    s = Math.exp(s);
    return Math.log(Math.tan(Math.PI / 4 + latRad / 2) * s);
  }

  function wgsToNtf(lat, lon) {
    const phi = lat * DEG2RAD;
    const lambda = lon * DEG2RAD;
    let aa = A_WGS;
    let e2 = E_WGS * E_WGS;
    let v = aa / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    let x = v * Math.cos(phi) * Math.cos(lambda);
    let y = v * Math.cos(phi) * Math.sin(lambda);
    let z = (1 - e2) * v * Math.sin(phi);
    x += 168;
    y += 60;
    z -= 320;
    aa = A_NTF;
    const b = B_NTF;
    e2 = E_NTF * E_NTF;
    const f = (aa - b) / aa;
    const p = Math.hypot(x, y);
    const r = Math.hypot(p, z);
    const u = Math.atan((z / p) * ((1 - f) + (e2 * aa / r)));
    let latNtf = Math.atan(
      (z * (1 - f) + e2 * aa * Math.sin(u) ** 3) /
      ((1 - f) * (p - e2 * aa * Math.cos(u) ** 3))
    ) * RAD2DEG;
    let lonNtf = Math.atan(y / x) / DEG2RAD - MERID_PARIS;
    if (x < 0) lonNtf += 180;
    return { lat: latNtf, lon: lonNtf };
  }

  function ntfToLambertIIE(latNtf, lonNtf) {
    const lIsom = latIsom(latNtf, E_NTF);
    const { n, c, xs, ys } = L2E;
    return {
      x: Math.round(xs + c * Math.exp(-n * lIsom) * Math.sin(n * lonNtf * DEG2RAD)),
      y: Math.round(ys - c * Math.exp(-n * lIsom) * Math.cos(n * lonNtf * DEG2RAD))
    };
  }

  function dfciLetter(a) {
    if (a > 7) a += 2;
    return String.fromCharCode(a + 65);
  }

  function lambertToDfci(xProj, yProj) {
    let xLamb = xProj;
    let yLamb = yProj - 1500000;
    let res = '';

    let a = Math.floor(xLamb / 100000);
    xLamb -= a * 100000;
    res += dfciLetter(a);

    a = Math.floor(yLamb / 100000);
    yLamb -= a * 100000;
    res += dfciLetter(a);

    a = Math.floor(xLamb / 20000);
    xLamb -= a * 20000;
    res += String(a * 2);

    a = Math.floor(yLamb / 20000);
    yLamb -= a * 20000;
    res += String(a * 2);

    a = Math.floor(xLamb / 2000);
    xLamb -= a * 2000;
    res += dfciLetter(a);

    a = Math.floor(yLamb / 2000);
    yLamb -= a * 2000;
    res += String(a);

    const base = res;
    let subdivision = '';
    if (xLamb > 500 && xLamb < 1501 && yLamb > 500 && yLamb < 1501) {
      subdivision = '.5';
    } else if (xLamb < 1000) {
      subdivision = yLamb < 1000 ? '.4' : '.1';
    } else {
      subdivision = yLamb < 1000 ? '.3' : '.2';
    }
    return { base, subdivision, full: base + subdivision };
  }

  function latLngToUtm(lat, lon) {
    const zone = Math.floor((lon + 180) / 6) + 1;
    const north = lat >= 0;
    const [easting, northing] = proj4('EPSG:4326', utmDefs(zone, north), [lon, lat]);
    return {
      zone,
      hemisphere: north ? 'N' : 'S',
      easting: Math.round(easting),
      northing: Math.round(northing)
    };
  }

  function latLngToDfci(lat, lon) {
    const ntf = wgsToNtf(lat, lon);
    const lambert = ntfToLambertIIE(ntf.lat, ntf.lon);
    return lambertToDfci(lambert.x, lambert.y);
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInGeoJSON(lat, lon, geometry) {
    if (!geometry) return false;
    if (geometry.type === 'Polygon') {
      const rings = geometry.coordinates;
      if (!pointInRing(lon, lat, rings[0])) return false;
      for (let h = 1; h < rings.length; h++) {
        if (pointInRing(lon, lat, rings[h])) return false;
      }
      return true;
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.some(poly =>
        pointInGeoJSON(lat, lon, { type: 'Polygon', coordinates: poly }));
    }
    return false;
  }

  function buildCommuneIndex(geojsonLayer) {
    const entries = [];
    if (!geojsonLayer) return entries;
    geojsonLayer.eachLayer(layer => {
      if (!layer.feature || !layer.getBounds) return;
      entries.push({
        nom: layer.feature.properties.nom || '—',
        bounds: layer.getBounds(),
        geometry: layer.feature.geometry
      });
    });
    return entries;
  }

  function findCommune(lat, lon, communeIndex) {
    if (!communeIndex || !communeIndex.length) return null;
    const ll = L.latLng(lat, lon);
    for (const entry of communeIndex) {
      if (!entry.bounds.contains(ll)) continue;
      if (pointInGeoJSON(lat, lon, entry.geometry)) return entry.nom;
    }
    return null;
  }

  global.CartoffCoords = {
    latLngToUtm,
    latLngToDfci,
    buildCommuneIndex,
    findCommune,
    loadElevationGrid,
    getElevation,
    isElevationReady: () => elevationGrid !== null
  };

  let elevationGrid = null;

  async function loadElevationGrid(baseUrl) {
    const root = (baseUrl || 'elevation').replace(/\/$/, '');
    try {
      const metaRes = await fetch(`${root}/loire_elev.meta.json`);
      const binRes = await fetch(`${root}/loire_elev.bin`);
      if (!metaRes.ok || !binRes.ok) throw new Error('fichiers altitude absents');
      const meta = await metaRes.json();
      const buf = await binRes.arrayBuffer();
      elevationGrid = { meta, heights: new Int16Array(buf) };
      return true;
    } catch (err) {
      console.warn('Altitude offline non disponible :', err.message || err);
      elevationGrid = null;
      return false;
    }
  }

  function getElevation(lat, lon) {
    if (!elevationGrid) return null;
    const m = elevationGrid.meta;
    if (lat < m.south || lat > m.north || lon < m.west || lon > m.east) return null;

    let col;
    let row;
    const t = m.transform;
    if (t && t.length === 6 && t[0] !== 0 && t[4] !== 0) {
      col = (lon - t[2]) / t[0];
      row = (lat - t[5]) / t[4];
    } else {
      col = ((lon - m.west) / (m.east - m.west)) * (m.cols - 1);
      row = ((m.north - lat) / (m.north - m.south)) * (m.rows - 1);
    }

    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    if (c0 < 0 || c0 >= m.cols - 1 || r0 < 0 || r0 >= m.rows - 1) return sampleCell(m, c0, r0);

    const dc = col - c0;
    const dr = row - r0;
    const z00 = sampleCell(m, c0, r0);
    const z10 = sampleCell(m, c0 + 1, r0);
    const z01 = sampleCell(m, c0, r0 + 1);
    const z11 = sampleCell(m, c0 + 1, r0 + 1);
    const values = [z00, z10, z01, z11].filter(v => v !== null);
    if (!values.length) return null;
    if (values.length < 4) return values[0];
    return Math.round(
      z00 * (1 - dc) * (1 - dr) +
      z10 * dc * (1 - dr) +
      z01 * (1 - dc) * dr +
      z11 * dc * dr
    );
  }

  function sampleCell(meta, col, row) {
    if (col < 0 || col >= meta.cols || row < 0 || row >= meta.rows) return null;
    const v = elevationGrid.heights[row * meta.cols + col];
    return v === meta.nodata ? null : v;
  }
})(typeof window !== 'undefined' ? window : globalThis);
