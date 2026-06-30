/**
 * Registre des types de constats / événements de situation.
 * Export : window.CartoffPoi
 */
(function () {
  'use strict';

  const DEFAULT_IMAGE = 'images/panneau_vierge_à_compléter.png';

  const POI_TYPES = {
    attention: {
      id: 'attention',
      label: 'Attention',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/AK14.png'
    },
    bouchon: {
      id: 'bouchon',
      label: 'Bouchon',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/AK30.PNG'
    },
    accident: {
      id: 'accident',
      label: 'Accident',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/AK31.PNG'
    },
    brouillard: {
      id: 'brouillard',
      label: 'Brouillard',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/AK32.PNG'
    },
    chaussee_glissante: {
      id: 'chaussee_glissante',
      label: 'Chaussée glissante',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/AK4.png'
    },
    travaux: {
      id: 'travaux',
      label: 'Travaux',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/AK5.png',
      lineStyle: { color: '#ff6f00', weight: 4, dashArray: '10 6' }
    },
    route_barree: {
      id: 'route_barree',
      label: 'Route barrée',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/KC1_route_barrée.png',
      lineStyle: { color: '#c62828', weight: 5 }
    },
    deviation: {
      id: 'deviation',
      label: 'Déviation',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/KD22a_gauche.png',
      imageVariants: {
        gauche: 'images/KD22a_gauche.png',
        droite: 'images/KD22a_droite.png',
        pl_gauche: 'images/KD22b2.png',
        pl_droite: 'images/KD22b_droite.png'
      },
      lineStyle: { color: '#f57c00', weight: 4, dashArray: '8 6' }
    },
    fin_deviation: {
      id: 'fin_deviation',
      label: 'Fin de déviation',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/KD69b.png'
    },
    circulation_alternee: {
      id: 'circulation_alternee',
      label: 'Circulation alternée',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/KC1_circulation_alternée.png',
      imageVariants: {
        feux: 'images/AK17.png'
      },
      lineStyle: { color: '#ff8f00', weight: 4, dashArray: '12 8' }
    },
    obstacle: {
      id: 'obstacle',
      label: 'Obstacle',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/AK14.png',
      lineStyle: { color: '#6d4c41', weight: 4 }
    },
    danger_divers: {
      id: 'danger_divers',
      label: 'Danger divers',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/AK14.png'
    },
    chaussee_retrecie: {
      id: 'chaussee_retrecie',
      label: 'Chaussée rétrécie',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/AK3.png',
      lineStyle: { color: '#795548', weight: 4, dashArray: '6 4' }
    },
    acces_interdit: {
      id: 'acces_interdit',
      label: 'Accès interdit',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/KC1_route_barrée.png',
      lineStyle: { color: '#b71c1c', weight: 5 }
    },
    sens_interdit: {
      id: 'sens_interdit',
      label: 'Sens interdit',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/EB20.svg',
      lineStyle: { color: '#d32f2f', weight: 5 }
    },
    coulee_debris: {
      id: 'coulee_debris',
      label: 'Coulée de boue/débris',
      categorie: 'secteur_routier',
      geometry: ['point'],
      image: 'images/coulée_débris.PNG'
    },
    route_inondee: {
      id: 'route_inondee',
      label: 'Route inondée',
      categorie: 'secteur_routier',
      geometry: ['point', 'line'],
      image: 'images/route_innondée.PNG',
      lineStyle: { color: '#1565c0', weight: 5 }
    },
    incendie: {
      id: 'incendie',
      label: 'Incendie',
      categorie: 'incendie_atmosphere',
      geometry: ['point'],
      image: 'images/incendie.png'
    },
    grele: {
      id: 'grele',
      label: 'Grêle',
      categorie: 'incendie_atmosphere',
      geometry: ['point'],
      image: DEFAULT_IMAGE
    },
    fumee: {
      id: 'fumee',
      label: 'Fumée',
      categorie: 'incendie_atmosphere',
      geometry: ['point'],
      image: 'images/incendie.png'
    },
    vent_violent: {
      id: 'vent_violent',
      label: 'Vent violent',
      categorie: 'incendie_atmosphere',
      geometry: ['point'],
      image: 'images/vent_violent.PNG'
    },
    incident_generique: {
      id: 'incident_generique',
      label: 'Incident générique',
      categorie: 'autre',
      geometry: ['point'],
      image: 'images/AK14.png'
    },
    eboulement: {
      id: 'eboulement',
      label: 'Éboulement',
      categorie: 'autre',
      geometry: ['point'],
      image: 'images/eboulement.PNG'
    }
  };

  const CATEGORIES = {
    secteur_routier: 'Secteur routier',
    incendie_atmosphere: 'Incendie & atmosphère',
    autre: 'Autre'
  };

  const VARIANT_LABELS = {
    gauche: 'gauche',
    droite: 'droite',
    pl_gauche: 'PL gauche',
    pl_droite: 'PL droite',
    feux: 'feux'
  };

  const DEFAULT_LINE_STYLE = { color: '#3949ab', weight: 4 };

  function getType(sousType) {
    if (!sousType) return null;
    return POI_TYPES[sousType] || null;
  }

  function getTypesForGeometry(kind) {
    return Object.values(POI_TYPES).filter((t) => {
      const g = t.geometry || ['point'];
      return g.includes(kind);
    });
  }

  function getLineStyle(typeId) {
    const type = getType(typeId);
    if (type && type.lineStyle) return { ...type.lineStyle };
    return { ...DEFAULT_LINE_STYLE };
  }

  function withImagesPrefix(path) {
    if (!path) return path;
    return path.startsWith('images/') ? path : 'images/' + path;
  }

  /** Résout un nom de panneau sans extension (png prioritaire sur svg). */
  function resolvePanelBasename(basename) {
    const p = basename.replace(/^images\//, '');
    if (/\.(png|svg|jpe?g|gif|webp)$/i.test(p)) {
      return withImagesPrefix(p);
    }
    return 'images/' + p + '.png';
  }

  function resolveImagePath(props) {
    if (!props) return DEFAULT_IMAGE;
    const type = getType(props.sous_type);
    const variante = props.variante;
    if (type) {
      if (variante && type.imageVariants && type.imageVariants[variante]) {
        return type.imageVariants[variante];
      }
      return type.image || DEFAULT_IMAGE;
    }
    if (props.panneau) {
      const p = props.panneau;
      if (/\.(png|svg|jpe?g|gif|webp)$/i.test(p)) {
        return withImagesPrefix(p);
      }
      return resolvePanelBasename(p);
    }
    return DEFAULT_IMAGE;
  }

  function getTypeLabel(props) {
    const type = getType(props && props.sous_type);
    return (props && props.libelle) || (type && type.label) || (props && props.sous_type) || 'Constat';
  }

  window.CartoffPoi = {
    POI_TYPES,
    CATEGORIES,
    VARIANT_LABELS,
    DEFAULT_IMAGE,
    DEFAULT_LINE_STYLE,
    getType,
    getTypesForGeometry,
    getLineStyle,
    resolveImagePath,
    resolvePanelBasename,
    getTypeLabel
  };
})();
