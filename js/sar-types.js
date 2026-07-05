/**

 * Rôles et types de mission SAR (Search and Rescue).

 * Export : window.CartoffSarTypes

 *

 * Propriétés GeoJSON :

 *   sar:mission_id, sar:role, sar:mission_type

 *   sar:azimuth, sar:range_km, sar:bearing_reciprocal — mission aéronef (relèvements)

 *   sar:station_id, sar:bearing_group_id — liaison station / paire réception-réciproque

 *   sar:quality_angle, sar:uncertainty_km, sar:fix_station_ids — fixe estimé (SAR-3)
 *   sar:fix_index, sar:fix_is_best, sar:fix_color — candidats multiples (SAR-3)
 *   sar:team_id, sar:team_name — équipe ayant effectué le relèvement (ou station DF)
 *   sar:elevation_m — altitude MNT au point visé (point de relevé)

 */

(function (global) {

  'use strict';



  const PROP_MISSION_ID = 'sar:mission_id';

  const PROP_ROLE = 'sar:role';

  const PROP_MISSION_TYPE = 'sar:mission_type';

  const PROP_AZIMUTH = 'sar:azimuth';

  const PROP_RANGE_KM = 'sar:range_km';

  const PROP_BEARING_RECIPROCAL = 'sar:bearing_reciprocal';

  const PROP_STATION_ID = 'sar:station_id';

  const PROP_BEARING_GROUP_ID = 'sar:bearing_group_id';

  const PROP_QUALITY_ANGLE = 'sar:quality_angle';

  const PROP_UNCERTAINTY_KM = 'sar:uncertainty_km';

  const PROP_FIX_STATION_IDS = 'sar:fix_station_ids';

  const PROP_FIX_INDEX = 'sar:fix_index';

  const PROP_FIX_IS_BEST = 'sar:fix_is_best';

  const PROP_FIX_COLOR = 'sar:fix_color';

  const PROP_TEAM_ID = 'sar:team_id';

  const PROP_TEAM_NAME = 'sar:team_name';

  const PROP_ELEVATION_M = 'sar:elevation_m';



  const DEFAULT_RANGE_KM = 30;

  const DEFAULT_UNCERTAINTY_KM = 2;

  const EARTH_RADIUS_KM = 6371;



  /** Palette pour les fixe estimés candidats (jusqu'à 8 paires). */

  const FIX_COLOR_PALETTE = [

    '#c62828',

    '#1565c0',

    '#2e7d32',

    '#6a1b9a',

    '#00838f',

    '#ef6c00',

    '#5d4037',

    '#ad1457'

  ];



  const MISSION_TYPES = {

    personne: {

      id: 'personne',

      label: 'Personne',

      enabled: true

    },

    aeronef: {

      id: 'aeronef',

      label: 'Aéronef',

      enabled: true

    }

  };



  const ROLES = {

    lkp: {

      id: 'lkp',

      label: 'LKP (dernière position connue)',

      shortLabel: 'LKP',

      geometry: 'point',

      missionTypes: ['personne'],

      markerClass: 'sar-marker-lkp',

      markerHtml: '<div>L</div>',

      legendClass: 'sar-legend-lkp'

    },

    indice: {

      id: 'indice',

      label: 'Indice',

      shortLabel: 'Indice',

      geometry: 'point',

      missionTypes: ['personne'],

      markerClass: 'sar-marker-indice',

      markerHtml: '<div>I</div>',

      legendClass: 'sar-legend-indice'

    },

    waypoint: {

      id: 'waypoint',

      label: 'Waypoint',

      shortLabel: 'WP',

      geometry: 'point',

      missionTypes: ['personne'],

      markerClass: 'sar-marker-waypoint',

      markerHtml: '<div>W</div>',

      legendClass: 'sar-legend-waypoint'

    },

    trace_fouille: {

      id: 'trace_fouille',

      label: 'Fouilles (zone fouillée)',

      shortLabel: 'Fouilles',

      geometry: 'polygon',

      missionTypes: ['personne'],

      polygonStyle: { color: '#2e7d32', weight: 2, fillColor: '#43a047', fillOpacity: 0.35 },

      legendClass: 'sar-legend-trace'

    },

    axe_probable: {

      id: 'axe_probable',

      label: 'Axe probable',

      shortLabel: 'Axe',

      geometry: 'line',

      missionTypes: ['personne'],

      lineStyle: { color: '#6a1b9a', weight: 4, dashArray: '6 4' },

      legendClass: 'sar-legend-axe'

    },

    station_df: {

      id: 'station_df',

      label: 'Station DF',

      shortLabel: 'DF',

      geometry: 'point',

      missionTypes: ['aeronef'],

      markerClass: 'sar-marker-station-df',

      markerHtml: '<div>▲</div>',

      legendClass: 'sar-legend-station-df'

    },

    relevement_df: {

      id: 'relevement_df',

      label: 'Relèvement DF',

      shortLabel: 'Rel.',

      geometry: 'line',

      missionTypes: ['aeronef'],

      lineStyle: { color: '#e65100', weight: 3 },

      lineStyleReciprocal: { color: '#e65100', weight: 2, dashArray: '8 6', opacity: 0.75 },

      legendClass: 'sar-legend-relevement'

    },

    releve_point: {

      id: 'releve_point',

      label: 'Point de relevé',

      shortLabel: 'Pt',

      geometry: 'point',

      missionTypes: ['aeronef'],

      markerClass: 'sar-marker-releve-point',

      markerHtml: '<div>●</div>',

      legendClass: 'sar-legend-releve-point'

    },

    fixe_estime: {

      id: 'fixe_estime',

      label: 'Fixe estimé (intersection DF)',

      shortLabel: 'Fix',

      geometry: 'point',

      missionTypes: ['aeronef'],

      markerClass: 'sar-marker-fixe-estime',

      markerHtml: '<div>+</div>',

      legendClass: 'sar-legend-fixe-estime'

    },

    incertitude_fix: {

      id: 'incertitude_fix',

      label: 'Incertitude fixe estimé',

      shortLabel: 'Inc.',

      geometry: 'polygon',

      missionTypes: ['aeronef'],

      polygonStyle: { color: '#c62828', weight: 1, fillColor: '#ef5350', fillOpacity: 0.12, dashArray: '4 4' },

      legendClass: 'sar-legend-incertitude-fix'

    }

  };



  function getRole(roleId) {

    return ROLES[roleId] || null;

  }



  function getMissionType(typeId) {

    return MISSION_TYPES[typeId] || null;

  }



  function rolesForMissionType(missionType) {

    return Object.keys(ROLES)

      .map((id) => ROLES[id])

      .filter((r) => !missionType || r.missionTypes.indexOf(missionType) >= 0);

  }



  function pointRoles(missionType) {

    return rolesForMissionType(missionType).filter((r) => r.geometry === 'point');

  }



  function lineRoles(missionType) {

    return rolesForMissionType(missionType).filter((r) => r.geometry === 'line');

  }



  function polygonRoles(missionType) {

    return rolesForMissionType(missionType).filter((r) => r.geometry === 'polygon');

  }



  function normalizeAzimuth(deg) {

    let n = Number(deg);

    if (!isFinite(n)) return 0;

    n = ((n % 360) + 360) % 360;

    return Math.round(n * 10) / 10;

  }



  function reciprocalAzimuth(azimuthDeg) {

    return normalizeAzimuth(Number(azimuthDeg) + 180);

  }



  /**

   * Point d'arrivée sur la sphère (WGS84) — bearing initial en degrés, distance en km.

   */

  function destinationPoint(lat, lon, bearingDeg, distanceKm) {

    const brng = (bearingDeg * Math.PI) / 180;

    const lat1 = (lat * Math.PI) / 180;

    const lon1 = (lon * Math.PI) / 180;

    const d = distanceKm / EARTH_RADIUS_KM;

    const lat2 = Math.asin(

      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)

    );

    const lon2 = lon1 + Math.atan2(

      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),

      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)

    );

    return {

      lat: (lat2 * 180) / Math.PI,

      lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180

    };

  }



  /** Segment depuis la station DF le long de l'azimut de relèvement sur range km. */
  function bearingLineCoordinates(originLat, originLon, azimuthDeg, rangeKm) {

    const az = normalizeAzimuth(azimuthDeg);

    const end = destinationPoint(originLat, originLon, az, rangeKm);

    return [

      [originLon, originLat],

      [end.lon, end.lat]

    ];

  }



  /** Géométrie LineString : signal direct (plein) ou arrière (+180°, pointillé). */
  function buildBearingLineFeature(originLat, originLon, azimuthDeg, rangeKm, isReciprocal) {

    const baseAz = normalizeAzimuth(azimuthDeg);

    const az = isReciprocal === true ? normalizeAzimuth(baseAz + 180) : baseAz;

    return bearingLineCoordinates(originLat, originLon, az, rangeKm);

  }



  function toRad(deg) {

    return (deg * Math.PI) / 180;

  }



  function toDeg(rad) {

    return (rad * 180) / Math.PI;

  }



  /** Bearing initial (degrés) de (lat1,lon1) vers (lat2,lon2). */

  function initialBearing(lat1, lon1, lat2, lon2) {

    const φ1 = toRad(lat1);

    const φ2 = toRad(lat2);

    const Δλ = toRad(lon2 - lon1);

    const y = Math.sin(Δλ) * Math.cos(φ2);

    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    return normalizeAzimuth(toDeg(Math.atan2(y, x)));

  }



  /**

   * Intersection de deux grands cercles (stations + azimuts de relèvement).

   * Retourne { lat, lon } ou null (parallèles, ambigu, ou pas d'intersection avant).

   */

  function intersectBearings(lat1, lon1, brng1, lat2, lon2, brng2) {

    const φ1 = toRad(lat1);

    const λ1 = toRad(lon1);

    const φ2 = toRad(lat2);

    const λ2 = toRad(lon2);

    const θ13 = toRad(brng1);

    const θ23 = toRad(brng2);

    const Δφ = φ2 - φ1;

    const Δλ = λ2 - λ1;

    const sinHalfΔφ = Math.sin(Δφ / 2);

    const sinHalfΔλ = Math.sin(Δλ / 2);

    const a = sinHalfΔφ * sinHalfΔφ + Math.cos(φ1) * Math.cos(φ2) * sinHalfΔλ * sinHalfΔλ;

    const δ12 = 2 * Math.asin(Math.min(1, Math.sqrt(a)));

    if (δ12 < 1e-12) return null;

    const cosδ12 = Math.cos(δ12);

    const sinδ12 = Math.sin(δ12);

    const θa = Math.acos(Math.min(1, Math.max(-1, (Math.sin(φ2) - Math.sin(φ1) * cosδ12) / (sinδ12 * Math.cos(φ1)))));

    const θb = Math.acos(Math.min(1, Math.max(-1, (Math.sin(φ1) - Math.sin(φ2) * cosδ12) / (sinδ12 * Math.cos(φ2)))));

    const θ12 = Math.sin(Δλ) > 0 ? θa : (2 * Math.PI - θa);

    const θ21 = Math.sin(Δλ) > 0 ? (2 * Math.PI - θb) : θb;

    const α1 = ((θ13 - θ12) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    const α2 = ((θ21 - θ23) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    if (Math.abs(Math.sin(α1)) < 1e-10 && Math.abs(Math.sin(α2)) < 1e-10) return null;

    if (Math.sin(α1) * Math.sin(α2) < 0) return null;

    const cosα1 = Math.cos(α1);

    const sinα1 = Math.sin(α1);

    const cosα2 = Math.cos(α2);

    const sinα2 = Math.sin(α2);

    const cosα3 = -cosα1 * cosα2 + sinα1 * sinα2 * cosδ12;

    const δ13 = Math.atan2(sinδ12 * sinα1 * sinα2, cosα2 + cosα1 * cosα3);

    const φ3 = Math.asin(Math.min(1, Math.max(-1, Math.sin(φ1) * Math.cos(δ13) + Math.cos(φ1) * Math.sin(δ13) * Math.cos(θ13))));

    const λ3 = λ1 + Math.atan2(Math.sin(θ13) * Math.sin(δ13) * Math.cos(φ1), Math.cos(δ13) - Math.sin(φ1) * Math.sin(φ3));

    return {

      lat: toDeg(φ3),

      lon: ((toDeg(λ3) + 540) % 360) - 180

    };

  }



  /** Angle de coupe au fixe (0–180°) — proche de 90° = meilleure qualité. */

  function cutAngleAtFix(latA, lonA, latB, lonB, latFix, lonFix) {

    const bA = initialBearing(latA, lonA, latFix, lonFix);

    const bB = initialBearing(latB, lonB, latFix, lonFix);

    let diff = Math.abs(bA - bB);

    if (diff > 180) diff = 360 - diff;

    return Math.round(diff * 10) / 10;

  }



  function qualityLabel(angleDeg) {

    if (angleDeg == null || !isFinite(angleDeg)) return '—';

    const a = Math.abs(angleDeg - 90);

    if (a <= 15) return 'Excellente';

    if (a <= 30) return 'Bonne';

    if (a <= 45) return 'Moyenne';

    return 'Faible';

  }



  /** Anneau polygonal approximant un cercle géodésique (km). */

  function circlePolygonCoordinates(centerLat, centerLon, radiusKm, segments) {

    const n = segments || 48;

    const ring = [];

    for (let i = 0; i < n; i++) {

      const az = (360 * i) / n;

      const pt = destinationPoint(centerLat, centerLon, az, radiusKm);

      ring.push([pt.lon, pt.lat]);

    }

    ring.push(ring[0].slice());

    return [ring];

  }



  /** Écart angulaire minimal entre deux azimuts (0–180°). */

  function bearingSeparation(deg1, deg2) {

    let d = Math.abs(deg1 - deg2);

    if (d > 180) d = 360 - d;

    return d;

  }



  /** Le fixe est-il devant chaque station le long de son azimut de relèvement ? */

  function isFixAlongBearings(latA, lonA, azA, latB, lonB, azB, latFix, lonFix, maxDiffDeg) {

    const tol = maxDiffDeg != null ? maxDiffDeg : 45;

    const toFixA = initialBearing(latA, lonA, latFix, lonFix);

    const toFixB = initialBearing(latB, lonB, latFix, lonFix);

    return bearingSeparation(toFixA, azA) <= tol && bearingSeparation(toFixB, azB) <= tol;

  }



  /** Clé stable pour une paire de relèvements (pas les coordonnées — plusieurs paires peuvent converger au même fixe). */

  function bearingPairKey(a, b) {

    const idA = a.stationId + ':' + (a.groupId != null ? a.groupId : a.azimuth);

    const idB = b.stationId + ':' + (b.groupId != null ? b.groupId : b.azimuth);

    return idA < idB ? idA + '|' + idB : idB + '|' + idA;

  }



  function tryIntersectionPair(a, b) {

    if (a.stationId === b.stationId) return null;

    const pt = intersectBearings(a.stationLat, a.stationLon, a.azimuth, b.stationLat, b.stationLon, b.azimuth);

    if (!pt) return null;

    if (!isFixAlongBearings(a.stationLat, a.stationLon, a.azimuth, b.stationLat, b.stationLon, b.azimuth, pt.lat, pt.lon)) {

      return null;

    }

    const qualityAngle = cutAngleAtFix(a.stationLat, a.stationLon, b.stationLat, b.stationLon, pt.lat, pt.lon);

    if (qualityAngle < 15) return null;

    return {

      lat: Math.round(pt.lat * 1e6) / 1e6,

      lon: Math.round(pt.lon * 1e6) / 1e6,

      qualityAngle,

      qualityLabel: qualityLabel(qualityAngle),

      score: Math.abs(qualityAngle - 90),

      stations: [

        { stationId: a.stationId, azimuth: a.azimuth, groupId: a.groupId },

        { stationId: b.stationId, azimuth: b.azimuth, groupId: b.groupId }

      ]

    };

  }



  /**

   * Toutes les intersections valides entre paires de stations distinctes.

   * Retourne { candidates: [...], best: {...} | null } triés par qualité (meilleur en premier).

   */

  function computeAllIntersections(receptions) {

    const list = receptions || [];

    if (list.length < 2) return { candidates: [], best: null };

    const raw = [];

    const seenPairs = new Set();

    for (let i = 0; i < list.length; i++) {

      for (let j = i + 1; j < list.length; j++) {

        const pairKey = bearingPairKey(list[i], list[j]);

        if (seenPairs.has(pairKey)) continue;

        const candidate = tryIntersectionPair(list[i], list[j]);

        if (!candidate) continue;

        seenPairs.add(pairKey);

        raw.push(candidate);

      }

    }

    raw.sort((a, b) => a.score - b.score);

    const candidates = raw.map((c, idx) => ({

      ...c,

      index: idx + 1,

      color: FIX_COLOR_PALETTE[idx % FIX_COLOR_PALETTE.length],

      isBest: idx === 0

    }));

    return { candidates, best: candidates.length ? candidates[0] : null };

  }



  /** Meilleur fixe seul (rétrocompatibilité). */

  function computeBestIntersection(receptions) {

    return computeAllIntersections(receptions).best;

  }



  function buildFeatureProps(mission, roleId, extra) {

    const role = getRole(roleId);

    const props = {

      id: (extra && extra.id) || null,

      [PROP_MISSION_ID]: mission.id,

      [PROP_ROLE]: roleId,

      [PROP_MISSION_TYPE]: mission.type,

      label: (extra && extra.label) || (role ? role.label : ''),

      notes: (extra && extra.notes) || '',

      created_at: (extra && extra.created_at) || new Date().toISOString()

    };

    if (extra && extra[PROP_STATION_ID] != null) {

      props[PROP_STATION_ID] = extra[PROP_STATION_ID];

    }

    if (extra && extra[PROP_BEARING_GROUP_ID] != null) {

      props[PROP_BEARING_GROUP_ID] = extra[PROP_BEARING_GROUP_ID];

    }

    if (extra && extra[PROP_AZIMUTH] != null) {

      props[PROP_AZIMUTH] = extra[PROP_AZIMUTH];

    }

    if (extra && extra[PROP_RANGE_KM] != null) {

      props[PROP_RANGE_KM] = extra[PROP_RANGE_KM];

    }

    if (extra && extra[PROP_BEARING_RECIPROCAL] != null) {

      props[PROP_BEARING_RECIPROCAL] = extra[PROP_BEARING_RECIPROCAL];

    }

    if (extra && extra[PROP_QUALITY_ANGLE] != null) {

      props[PROP_QUALITY_ANGLE] = extra[PROP_QUALITY_ANGLE];

    }

    if (extra && extra[PROP_UNCERTAINTY_KM] != null) {

      props[PROP_UNCERTAINTY_KM] = extra[PROP_UNCERTAINTY_KM];

    }

    if (extra && extra[PROP_FIX_STATION_IDS] != null) {

      props[PROP_FIX_STATION_IDS] = extra[PROP_FIX_STATION_IDS];

    }

    if (extra && extra[PROP_FIX_INDEX] != null) {

      props[PROP_FIX_INDEX] = extra[PROP_FIX_INDEX];

    }

    if (extra && extra[PROP_FIX_IS_BEST] != null) {

      props[PROP_FIX_IS_BEST] = extra[PROP_FIX_IS_BEST];

    }

    if (extra && extra[PROP_FIX_COLOR] != null) {

      props[PROP_FIX_COLOR] = extra[PROP_FIX_COLOR];

    }

    if (extra && extra[PROP_TEAM_ID] != null) {

      props[PROP_TEAM_ID] = extra[PROP_TEAM_ID];

    }

    if (extra && extra[PROP_TEAM_NAME] != null) {

      props[PROP_TEAM_NAME] = extra[PROP_TEAM_NAME];

    }

    if (extra && extra[PROP_ELEVATION_M] != null) {

      props[PROP_ELEVATION_M] = extra[PROP_ELEVATION_M];

    }

    return props;

  }



  global.CartoffSarTypes = {

    PROP_MISSION_ID,

    PROP_ROLE,

    PROP_MISSION_TYPE,

    PROP_AZIMUTH,

    PROP_RANGE_KM,

    PROP_BEARING_RECIPROCAL,

    PROP_STATION_ID,

    PROP_BEARING_GROUP_ID,

    PROP_QUALITY_ANGLE,

    PROP_UNCERTAINTY_KM,

    PROP_FIX_STATION_IDS,

    PROP_FIX_INDEX,

    PROP_FIX_IS_BEST,

    PROP_FIX_COLOR,

    PROP_TEAM_ID,

    PROP_TEAM_NAME,

    PROP_ELEVATION_M,

    FIX_COLOR_PALETTE,

    DEFAULT_RANGE_KM,

    DEFAULT_UNCERTAINTY_KM,

    MISSION_TYPES,

    ROLES,

    getRole,

    getMissionType,

    rolesForMissionType,

    pointRoles,

    lineRoles,

    polygonRoles,

    normalizeAzimuth,

    reciprocalAzimuth,

    destinationPoint,

    bearingLineCoordinates,

    buildBearingLineFeature,

    initialBearing,

    intersectBearings,

    cutAngleAtFix,

    bearingSeparation,

    isFixAlongBearings,

    qualityLabel,

    circlePolygonCoordinates,

    computeAllIntersections,

    computeBestIntersection,

    buildFeatureProps

  };

})(typeof window !== 'undefined' ? window : this);


