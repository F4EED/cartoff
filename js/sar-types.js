/**

 * Rôles et types de mission SAR (Search and Rescue).

 * Export : window.CartoffSarTypes

 *

 * Propriétés GeoJSON :

 *   sar:mission_id, sar:role, sar:mission_type

 *   sar:azimuth, sar:range_km, sar:bearing_reciprocal — mission aéronef (relèvements)

 *   sar:station_id, sar:bearing_group_id — liaison station / paire réception-réciproque

 *   SAR-3 (différé) : intersection de relèvements, rapport d'export enrichi

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



  const DEFAULT_RANGE_KM = 30;

  const EARTH_RADIUS_KM = 6371;



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

    return normalizeAzimuth(azimuthDeg + 180);

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



  function bearingLineCoordinates(stationLat, stationLon, azimuthDeg, rangeKm) {

    const end = destinationPoint(stationLat, stationLon, azimuthDeg, rangeKm);

    return [

      [stationLon, stationLat],

      [end.lon, end.lat]

    ];

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

    DEFAULT_RANGE_KM,

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

    buildFeatureProps

  };

})(typeof window !== 'undefined' ? window : this);


