/**
 * Calque « Opération de recherche » — même modèle que Constats / événements.
 * Export : window.CartoffSarOperation
 */
(function (global) {
  'use strict';

  const LAYER_NAME = 'Opération de recherche';
  const STORAGE_KEY = 'cartoff_sar_operation';
  const POI_CATEGORY = 'recherche_sar';
  const CREATED_BY = 'sar_operation';

  let map;
  let layersRef;
  let updateLegendFn;
  let findCommuneFn;
  let latLngToDfciFn;
  let openMapContextMenuFn;
  let setupSearchFn;
  let panelEl;
  let panelTitleEl;
  let panelTypeEl;
  let panelLibelleEl;
  let panelSaveBtn;
  let panelCancelBtn;
  let panelDeleteBtn;
  let drawBannerEl;
  let drawFinishBtn;
  let drawCancelBtn;
  let layersContainerEl;
  let hintEl;

  let features = [];
  let legendEntries = [];
  let panelState = null;
  let drawState = null;
  let showInactifs = false;
  let sectionVisible = false;
  let sectionEl;
  const iconCache = {};

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function checkboxIdForLayer(name) {
    return 'layer_' + name.replace(/[^a-zA-Z0-9]/g, '_');
  }

  function isInactif(props) {
    return !!(props && props.statut === 'inactif');
  }

  function getFeaturesForDisplay() {
    if (showInactifs) return features;
    return features.filter((f) => !isInactif(f.properties));
  }

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'ops-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function findFeature(id) {
    return features.find((f) => f.properties && f.properties.id === id) || null;
  }

  function persistFeatures() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      type: 'FeatureCollection',
      features: features
    }));
  }

  function initFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.features)) features = data.features;
    } catch (err) {
      console.warn('Opération de recherche localStorage invalide :', err);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function getTypesForGeometry(kind) {
    return Object.values(global.CartoffPoi.POI_TYPES).filter((t) => {
      const g = t.geometry || ['point'];
      return g.includes(kind) && t.categorie === POI_CATEGORY;
    });
  }

  function buildTypeSelect(selectEl, geometryKind) {
    selectEl.innerHTML = '';
    const types = getTypesForGeometry(geometryKind);
    const og = document.createElement('optgroup');
    og.label = global.CartoffPoi.CATEGORIES[POI_CATEGORY] || 'Opération de recherche';
    types.sort((a, b) => a.label.localeCompare(b.label, 'fr')).forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      og.appendChild(opt);
    });
    selectEl.appendChild(og);
  }

  function panneauBasenameFromType(typeId) {
    const path = global.CartoffPoi.resolveImagePath({ sous_type: typeId });
    const base = path.replace(/^images\//, '').split('/').pop();
    return base || 'panneau_vierge_à_compléter.png';
  }

  function getIcon(imagePath, inactif) {
    const resolved = imagePath || global.CartoffPoi.DEFAULT_IMAGE;
    const iconUrl = encodeURI(resolved);
    const cacheKey = iconUrl + (inactif ? '|inactif' : '');
    if (!iconCache[cacheKey]) {
      iconCache[cacheKey] = L.icon({
        iconUrl: iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
        className: inactif ? 'situation-marker-inactif' : ''
      });
    }
    return iconCache[cacheKey];
  }

  function lineStyle(props) {
    const base = global.CartoffPoi.getLineStyle(props && props.sous_type);
    const inactif = isInactif(props);
    return { ...base, opacity: inactif ? 0.45 : 1 };
  }

  function polygonStyle(props) {
    const base = global.CartoffPoi.getPolygonStyle(props && props.sous_type);
    const inactif = isInactif(props);
    const fillOpacity = base.fillOpacity != null ? base.fillOpacity : 0.3;
    return {
      ...base,
      opacity: inactif ? 0.45 : 1,
      fillOpacity: inactif ? fillOpacity * 0.45 : fillOpacity
    };
  }

  function polygonRingToLatLngs(ring) {
    if (!ring || !ring.length) return [];
    const coords = ring.slice();
    if (coords.length > 1) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) coords.pop();
    }
    return coords.map((c) => L.latLng(c[1], c[0]));
  }

  function geomAnchorLatLng(geom) {
    if (!geom) return null;
    if (geom.type === 'Point' && geom.coordinates) {
      return L.latLng(geom.coordinates[1], geom.coordinates[0]);
    }
    if (geom.type === 'LineString' && geom.coordinates && geom.coordinates.length) {
      const c = geom.coordinates[0];
      return L.latLng(c[1], c[0]);
    }
    if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0]) {
      const latlngs = polygonRingToLatLngs(geom.coordinates[0]);
      if (!latlngs.length) return null;
      return L.polygon(latlngs).getBounds().getCenter();
    }
    return null;
  }

  function buildPopupContent(props) {
    const type = global.CartoffPoi.getType(props.sous_type);
    const typeLabel = (type && type.label) || props.sous_type || 'Élément';
    const libelle = props.libelle || typeLabel;
    let html = '<b>' + escapeHtml(libelle) + '</b><br>';
    html += '<b>Type :</b> ' + escapeHtml(typeLabel) + '<br>';
    html += '<b>Statut :</b> ' + (isInactif(props) ? 'Inactif' : 'Actif') + '<br>';
    if (props.commune) html += '<b>Commune :</b> ' + escapeHtml(props.commune) + '<br>';
    if (props.dfci) html += '<b>DFCI :</b> ' + escapeHtml(props.dfci) + '<br>';
    return html;
  }

  function collectLegendEntries(displayFeatures) {
    const seen = new Map();
    (displayFeatures || []).forEach((feature) => {
      const props = feature.properties || {};
      const imagePath = global.CartoffPoi.resolveImagePath(props);
      const type = global.CartoffPoi.getType(props.sous_type);
      const label = props.libelle || (type && type.label) || props.sous_type || 'Élément';
      const key = [props.sous_type || '', imagePath].join('|');
      if (!seen.has(key)) seen.set(key, { imagePath, label });
    });
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }

  function bindFeatureContextMenu(layer, feature) {
    const showMenu = (domEvent, clickLatLng) => {
      L.DomEvent.stop(domEvent);
      const geom = feature.geometry || {};
      const isLine = geom.type === 'LineString';
      const isPolygon = geom.type === 'Polygon';
      let latlng = clickLatLng || (layer.getLatLng ? layer.getLatLng() : null);
      if (!latlng) latlng = geomAnchorLatLng(geom);
      if (openMapContextMenuFn) {
        openMapContextMenuFn(domEvent.clientX, domEvent.clientY, {
          type: isLine ? 'line' : (isPolygon ? 'polygon' : 'marker'),
          feature,
          latlng
        });
      }
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

  function buildLayerFromFeatures(displayFeatures) {
    const group = L.layerGroup([], { pane: 'operationPane' });
    (displayFeatures || []).forEach((feature) => {
      const props = feature.properties || {};
      const geom = feature.geometry;
      if (!geom) return;

      if (geom.type === 'Point' && geom.coordinates) {
        const latlng = L.latLng(geom.coordinates[1], geom.coordinates[0]);
        const marker = L.marker(latlng, {
          icon: getIcon(global.CartoffPoi.resolveImagePath(props), isInactif(props)),
          pane: 'operationPane'
        });
        marker._cartoffOperationFeature = feature;
        marker.bindPopup(buildPopupContent(props));
        bindFeatureContextMenu(marker, feature);
        group.addLayer(marker);
      } else if (geom.type === 'LineString' && geom.coordinates && geom.coordinates.length >= 2) {
        const latlngs = geom.coordinates.map((c) => L.latLng(c[1], c[0]));
        const polyline = L.polyline(latlngs, { ...lineStyle(props), pane: 'operationPane' });
        polyline._cartoffOperationFeature = feature;
        polyline.bindPopup(buildPopupContent(props));
        bindFeatureContextMenu(polyline, feature);
        group.addLayer(polyline);

        const imagePath = global.CartoffPoi.resolveImagePath(props);
        const inactif = isInactif(props);
        [latlngs[0], latlngs[latlngs.length - 1]].forEach((ll) => {
          const iconMarker = L.marker(ll, {
            icon: getIcon(imagePath, inactif),
            pane: 'operationPane'
          });
          iconMarker._cartoffOperationFeature = feature;
          iconMarker.bindPopup(buildPopupContent(props));
          bindFeatureContextMenu(iconMarker, feature);
          group.addLayer(iconMarker);
        });
      } else if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0] && geom.coordinates[0].length >= 3) {
        const latlngs = polygonRingToLatLngs(geom.coordinates[0]);
        const polygon = L.polygon(latlngs, { ...polygonStyle(props), pane: 'operationPane' });
        polygon._cartoffOperationFeature = feature;
        polygon.bindPopup(buildPopupContent(props));
        bindFeatureContextMenu(polygon, feature);
        group.addLayer(polygon);

        const imagePath = global.CartoffPoi.resolveImagePath(props);
        const centroid = polygon.getBounds().getCenter();
        const iconMarker = L.marker(centroid, {
          icon: getIcon(imagePath, isInactif(props)),
          pane: 'operationPane'
        });
        iconMarker._cartoffOperationFeature = feature;
        iconMarker.bindPopup(buildPopupContent(props));
        bindFeatureContextMenu(iconMarker, feature);
        group.addLayer(iconMarker);
      }
    });
    return group;
  }

  function isLayerVisible() {
    const layer = layersRef && layersRef[LAYER_NAME];
    return !!(layer && map && map.hasLayer(layer));
  }

  function rebuildLayer() {
    const checkbox = document.getElementById(checkboxIdForLayer(LAYER_NAME));
    const wasVisible = isLayerVisible();
    const oldLayer = layersRef && layersRef[LAYER_NAME];
    if (oldLayer && map && map.hasLayer(oldLayer)) map.removeLayer(oldLayer);

    const displayFeatures = getFeaturesForDisplay();
    legendEntries = collectLegendEntries(displayFeatures);
    const newLayer = buildLayerFromFeatures(displayFeatures);
    if (layersRef) layersRef[LAYER_NAME] = newLayer;

    if ((wasVisible || (checkbox && checkbox.checked)) && map) {
      newLayer.addTo(map);
      if (checkbox) checkbox.checked = true;
    }
    updateInactifsFilterUI();
    if (updateLegendFn) updateLegendFn();
    if (setupSearchFn) setupSearchFn();
  }

  function updateInactifsFilterUI() {
    const label = document.getElementById('operationShowInactifsLabel');
    const checkbox = document.getElementById('operationShowInactifs');
    if (!label || !checkbox) return;
    const hasInactifs = features.some((f) => isInactif(f.properties));
    const showFilter = features.length > 0 && hasInactifs;
    label.hidden = !showFilter;
    if (!showFilter && checkbox.checked) {
      checkbox.checked = false;
      showInactifs = false;
    }
  }

  function ensureLayerReady() {
    if (!layersRef[LAYER_NAME]) {
      initFromStorage();
      rebuildLayer();
    } else {
      rebuildLayer();
    }
    return layersRef[LAYER_NAME];
  }

  function addLazyCheckbox(container) {
    if (!container) return;
    container.innerHTML = '';
    const id = checkboxIdForLayer(LAYER_NAME);
    const label = document.createElement('label');
    label.htmlFor = id;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = false;
    checkbox.addEventListener('change', async (e) => {
      if (e.target.checked) {
        checkbox.disabled = true;
        const layer = ensureLayerReady();
        checkbox.disabled = false;
        if (!layer) {
          checkbox.checked = false;
          return;
        }
        if (!map.hasLayer(layer)) layer.addTo(map);
        if (updateLegendFn) updateLegendFn();
      } else if (layersRef[LAYER_NAME]) {
        map.removeLayer(layersRef[LAYER_NAME]);
        if (updateLegendFn) updateLegendFn();
      }
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + LAYER_NAME));
    container.appendChild(label);
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

  function positionPanel(clientX, clientY) {
    if (!panelEl) return;
    panelEl.style.left = clientX + 'px';
    panelEl.style.top = clientY + 'px';
    panelEl.hidden = false;
    const pos = clampPopupPosition(panelEl, clientX, clientY, 10);
    panelEl.style.left = pos.x + 'px';
    panelEl.style.top = pos.y + 'px';
  }

  function resetHint() {
    if (hintEl) {
      hintEl.textContent = 'Clic droit sur la carte pour ajouter ou modifier un élément. Cochez le calque ci-dessous pour l\'affichage.';
    }
  }

  function closePanel() {
    if (panelState && panelState.draftMarker) map.removeLayer(panelState.draftMarker);
    if (panelState && panelState.draftLayer) map.removeLayer(panelState.draftLayer);
    panelState = null;
    if (panelEl) panelEl.hidden = true;
    resetHint();
  }

  function showPanel({ mode, geometry, sousType, libelle }) {
    if (!panelEl || !panelTitleEl || !panelTypeEl || !panelLibelleEl) return;
    const isLine = geometry === 'line' || geometry === 'LineString';
    const isPolygon = geometry === 'polygon' || geometry === 'Polygon';
    if (mode === 'edit') {
      panelTitleEl.textContent = isLine ? 'Modifier le tronçon' : (isPolygon ? 'Modifier la zone' : 'Modifier l\'élément');
    } else {
      panelTitleEl.textContent = isLine ? 'Nouveau tronçon' : (isPolygon ? 'Nouvelle zone' : 'Nouvel élément');
    }
    const defaultType = isLine ? 'ops_axe' : (isPolygon ? 'ops_secteur' : 'ops_repere');
    panelTypeEl.value = sousType || defaultType;
    panelLibelleEl.value = libelle || '';
    if (panelDeleteBtn) panelDeleteBtn.hidden = mode !== 'edit';
    panelEl.hidden = false;
  }

  function openPanelAdd(latlng, clientX, clientY, sousType) {
    cancelInteractions();
    closePanel();
    buildTypeSelect(panelTypeEl, 'point');
    const draftMarker = L.marker(latlng, {
      icon: getIcon(global.CartoffPoi.DEFAULT_IMAGE, false),
      pane: 'operationPane',
      interactive: false
    }).addTo(map);
    panelState = { mode: 'add', geometry: 'Point', latlng, draftMarker };
    showPanel({ mode: 'add', geometry: 'point', sousType: sousType || 'ops_repere', libelle: '' });
    positionPanel(clientX, clientY);
  }

  function openPanelEdit(feature, latlng, clientX, clientY) {
    cancelInteractions();
    closePanel();
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const isLine = geom.type === 'LineString';
    const isPolygon = geom.type === 'Polygon';
    const geometryKind = isLine ? 'line' : (isPolygon ? 'polygon' : 'point');
    buildTypeSelect(panelTypeEl, geometryKind);
    panelState = {
      mode: 'edit',
      featureId: props.id,
      geometry: geom.type || 'Point',
      coordinates: geom.coordinates,
      latlng
    };
    showPanel({
      mode: 'edit',
      geometry: geometryKind,
      sousType: props.sous_type,
      libelle: props.libelle || ''
    });
    positionPanel(clientX, clientY);
  }

  function savePanel() {
    if (!panelState) return;
    const typeId = panelTypeEl.value;
    const type = global.CartoffPoi.getType(typeId);
    const libelle = panelLibelleEl.value.trim();
    const isLine = panelState.geometry === 'LineString';
    const isPolygon = panelState.geometry === 'Polygon';
    let lat;
    let lon;
    if (isLine && panelState.coordinates && panelState.coordinates.length) {
      lon = panelState.coordinates[0][0];
      lat = panelState.coordinates[0][1];
    } else if (isPolygon && panelState.latlng) {
      lat = panelState.latlng.lat;
      lon = panelState.latlng.lng;
    } else if (panelState.latlng) {
      lat = panelState.latlng.lat;
      lon = panelState.latlng.lng;
    } else {
      return;
    }
    const commune = findCommuneFn ? findCommuneFn(lat, lon) : null;
    const dfci = latLngToDfciFn ? latLngToDfciFn(lat, lon) : null;

    let props;
    if (panelState.mode === 'edit') {
      const existing = findFeature(panelState.featureId);
      const prev = (existing && existing.properties) || {};
      props = {
        ...prev,
        sous_type: typeId,
        panneau: panneauBasenameFromType(typeId),
        libelle: libelle || (type ? type.label : ''),
        statut: prev.statut || 'actif'
      };
    } else {
      props = {
        id: newId(),
        sous_type: typeId,
        panneau: panneauBasenameFromType(typeId),
        libelle: libelle || (type ? type.label : ''),
        statut: 'actif',
        created_at: new Date().toISOString(),
        created_by: CREATED_BY
      };
    }
    if (commune) props.commune = commune;
    if (dfci && dfci.base) props.dfci = dfci.base;

    let geometry;
    if (isLine) {
      geometry = { type: 'LineString', coordinates: panelState.coordinates.slice() };
    } else if (isPolygon) {
      geometry = { type: 'Polygon', coordinates: panelState.coordinates.slice() };
    } else if (panelState.mode === 'edit') {
      const existing = findFeature(panelState.featureId);
      geometry = (existing && existing.geometry) || { type: 'Point', coordinates: [lon, lat] };
    } else {
      geometry = { type: 'Point', coordinates: [lon, lat] };
    }

    const feature = { type: 'Feature', geometry, properties: props };
    if (panelState.mode === 'edit') {
      const idx = features.findIndex((f) => f.properties && f.properties.id === panelState.featureId);
      if (idx >= 0) features[idx] = feature;
    } else {
      features.push(feature);
    }
    persistFeatures();
    closePanel();
    rebuildLayer();
  }

  function deletePanelFeature() {
    if (!panelState || panelState.mode !== 'edit') return;
    features = features.filter((f) => !f.properties || f.properties.id !== panelState.featureId);
    persistFeatures();
    closePanel();
    rebuildLayer();
  }

  function deleteFeature(feature) {
    const id = feature.properties && feature.properties.id;
    if (!id) return;
    features = features.filter((f) => !f.properties || f.properties.id !== id);
    persistFeatures();
    closePanel();
    rebuildLayer();
  }

  function setFeatureStatut(feature, statut) {
    const id = feature.properties && feature.properties.id;
    if (!id) return;
    const existing = findFeature(id);
    if (!existing || !existing.properties) return;
    existing.properties.statut = statut;
    persistFeatures();
    closePanel();
    rebuildLayer();
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

  function onDrawDblClick(e) {
    if (!drawState || drawState.mode !== 'line' || drawState.vertices.length < 2) return;
    L.DomEvent.stop(e);
    finishDraw(e.originalEvent.clientX, e.originalEvent.clientY);
  }

  function cancelDrawMode() {
    if (!drawState) return;
    map.removeLayer(drawState.previewLayer);
    drawState = null;
    map.getContainer().classList.remove('situation-line-drawing');
    if (drawBannerEl) drawBannerEl.hidden = true;
    map.off('click', onDrawClick);
    map.off('dblclick', onDrawDblClick);
    map.doubleClickZoom.enable();
    resetHint();
  }

  function finishDraw(clientX, clientY) {
    if (!drawState) return;
    const minVerts = drawState.mode === 'polygon' ? 3 : 2;
    if (drawState.vertices.length < minVerts) return;

    let coordinates;
    let geometry;
    let defaultType;
    let geometryKind;
    if (drawState.mode === 'polygon') {
      const ring = drawState.vertices.map((ll) => [ll.lng, ll.lat]);
      ring.push(ring[0].slice());
      coordinates = [ring];
      geometry = 'Polygon';
      defaultType = 'ops_secteur';
      geometryKind = 'polygon';
    } else {
      coordinates = drawState.vertices.map((ll) => [ll.lng, ll.lat]);
      geometry = 'LineString';
      defaultType = 'ops_axe';
      geometryKind = 'line';
    }

    const previewLayer = drawState.previewLayer;
    const center = previewLayer.getBounds ? previewLayer.getBounds().getCenter() : drawState.vertices[0];
    const presetSousType = drawState.presetSousType;
    map.removeLayer(previewLayer);
    drawState = null;
    map.getContainer().classList.remove('situation-line-drawing');
    if (drawBannerEl) drawBannerEl.hidden = true;
    map.off('click', onDrawClick);
    map.off('dblclick', onDrawDblClick);
    map.doubleClickZoom.enable();

    closePanel();
    buildTypeSelect(panelTypeEl, geometryKind);
    panelState = {
      mode: 'add',
      geometry,
      coordinates,
      latlng: center,
      draftLayer: L.layerGroup([], { pane: 'operationPane' }).addTo(map)
    };
    showPanel({ mode: 'add', geometry: geometryKind, sousType: presetSousType || defaultType, libelle: '' });
    positionPanel(clientX, clientY);
  }

  function startDrawMode(mode, initialLatLng, presetSousType) {
    cancelInteractions();
    const isPolygon = mode === 'polygon';
    const previewStyle = isPolygon
      ? { color: '#1565c0', weight: 2, fillColor: '#1976d2', fillOpacity: 0.25, pane: 'operationPane' }
      : { color: '#1565c0', weight: 3, dashArray: '6 4', pane: 'operationPane' };
    const previewLayer = isPolygon
      ? L.polygon(initialLatLng ? [initialLatLng] : [], previewStyle)
      : L.polyline(initialLatLng ? [initialLatLng] : [], previewStyle);
    previewLayer.addTo(map);
    drawState = {
      mode,
      vertices: initialLatLng ? [initialLatLng] : [],
      previewLayer,
      presetSousType: presetSousType || null
    };
    map.getContainer().classList.add('situation-line-drawing');
    if (drawBannerEl) {
      drawBannerEl.hidden = false;
      drawBannerEl.querySelector('#operationDrawBannerText').textContent = isPolygon
        ? 'Cliquez pour le contour — Terminer pour fermer (min. 3 points)'
        : 'Cliquez pour placer les points — Terminer pour valider';
    }
    updateDrawUI();
    map.doubleClickZoom.disable();
    map.on('click', onDrawClick);
    if (!isPolygon) map.on('dblclick', onDrawDblClick);
    if (hintEl) {
      hintEl.textContent = isPolygon
        ? 'Mode zone — cliquez pour le contour, Terminer pour fermer le polygone.'
        : 'Mode tronçon — cliquez pour ajouter des points, double-clic ou Terminer pour valider.';
    }
  }

  function cancelInteractions() {
    cancelDrawMode();
    closePanel();
  }

  function isOperationFeature(feature) {
    const props = feature && feature.properties;
    return !!(props && props.created_by === CREATED_BY);
  }

  function updateVisibility(visible) {
    sectionVisible = !!visible;
    if (sectionEl) sectionEl.hidden = !sectionVisible;
    const searchEl = document.getElementById('operationRechercheSearch');
    if (searchEl) searchEl.hidden = !sectionVisible;
    if (!sectionVisible) cancelInteractions();
  }

  function buildMapContextMenu(menuEl, addItem, target, clientX, clientY, opts) {
    opts = opts || {};
    const hostEl = opts.hostEl || menuEl;
    if (!sectionVisible) return false;

    if (target.feature && isOperationFeature(target.feature)) {
      if (!opts.skipSection) {
        const section = document.createElement('div');
        section.className = 'map-context-menu-section';
        section.textContent = opts.sectionLabel || 'Opération de recherche';
        menuEl.appendChild(section);
      }

      const props = target.feature.properties || {};
      const inactif = isInactif(props);
      const geom = target.feature.geometry || {};
      const isLine = geom.type === 'LineString';
      const isPolygon = geom.type === 'Polygon';
      const editLabel = isLine ? 'Modifier ce tronçon' : (isPolygon ? 'Modifier cette zone' : 'Modifier cet élément');
      addItem(editLabel, () => {
        openPanelEdit(target.feature, target.latlng, clientX, clientY);
      });
      if (inactif) {
        addItem('Réactiver', () => setFeatureStatut(target.feature, 'actif'));
      } else {
        addItem('Marquer comme inactif', () => setFeatureStatut(target.feature, 'inactif'));
      }
      addItem('Supprimer', () => deleteFeature(target.feature), { danger: true });
      return true;
    }

    if (target.feature && !isOperationFeature(target.feature)) return false;

    if (!opts.skipSection) {
      const section = document.createElement('div');
      section.className = 'map-context-menu-section';
      section.textContent = opts.sectionLabel || 'Opération de recherche';
      menuEl.appendChild(section);
    }

    if (target.type === 'marker' || target.type === 'line' || target.type === 'polygon') return false;

    const addSubmenu = global.addMapContextMenuSubmenu;
    if (addSubmenu) {
      const pointTypes = getTypesForGeometry('point')
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      const lineTypes = getTypesForGeometry('line')
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      const polygonTypes = getTypesForGeometry('polygon')
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      addSubmenu(hostEl, 'Point', pointTypes.map((t) => ({
        label: t.label,
        onClick: () => openPanelAdd(target.latlng, clientX, clientY, t.id)
      })));
      addSubmenu(hostEl, 'Tronçon', lineTypes.map((t) => ({
        label: t.label,
        onClick: () => startDrawMode('line', target.latlng, t.id)
      })));
      addSubmenu(hostEl, 'Surface', polygonTypes.map((t) => ({
        label: t.label,
        onClick: () => startDrawMode('polygon', target.latlng, t.id)
      })));
      return !!(pointTypes.length || lineTypes.length || polygonTypes.length);
    }

    addItem('Point (panneau)', () => openPanelAdd(target.latlng, clientX, clientY));
    addItem('Tronçon (ligne)', () => startDrawMode('line', target.latlng));
    addItem('Zone (surface)', () => startDrawMode('polygon', target.latlng));
    return true;
  }

  function getFeatureFromDomEvent(domEvent) {
    const layer = layersRef && layersRef[LAYER_NAME];
    if (!layer || !map || !map.hasLayer(layer)) return null;
    let el = domEvent.target;
    const container = map.getContainer();
    while (el && el !== container) {
      const hit = map._targets && map._targets[L.Util.stamp(el)];
      if (hit && hit._cartoffOperationFeature) return hit;
      el = el.parentNode;
    }
    return null;
  }

  function exportGeoJSON() {
    const json = JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2);
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dh = (global.CartoffSar && global.CartoffSar.formatExportDateHeure)
      ? global.CartoffSar.formatExportDateHeure()
      : '';
    a.download = 'operation_recherche' + (dh ? '_' + dh : '') + '.geojson';
    a.click();
    URL.revokeObjectURL(url);
  }

  function getLegendHtml() {
    if (!legendEntries.length) return escapeHtml(LAYER_NAME) + ' — aucun élément<br>';
    let html = '';
    legendEntries.forEach((entry) => {
      html += '<img src="' + encodeURI(entry.imagePath) + '" class="icon" alt=""> ' +
        escapeHtml(entry.label) + '<br>';
    });
    return html;
  }

  function buildSearchEntries() {
    const source = getFeaturesForDisplay();
    if (!source.length) return [];
    return source
      .filter((f) => f && f.geometry)
      .map((feature) => {
        const props = feature.properties || {};
        const type = global.CartoffPoi.getType(props.sous_type);
        const typeLabel = (type && type.label) || props.sous_type || '';
        const libelle = props.libelle || typeLabel || 'Élément';
        const inactif = isInactif(props);
        const geom = feature.geometry;
        let bounds = null;
        if (geom.type === 'Point') {
          const ll = L.latLng(geom.coordinates[1], geom.coordinates[0]);
          bounds = L.latLngBounds(ll, ll);
        } else if (geom.type === 'LineString' && geom.coordinates.length >= 2) {
          const latlngs = geom.coordinates.map((c) => L.latLng(c[1], c[0]));
          bounds = L.latLngBounds(latlngs);
        } else if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0]) {
          const latlngs = polygonRingToLatLngs(geom.coordinates[0]);
          if (latlngs.length) bounds = L.latLngBounds(latlngs);
        }
        const isLine = geom.type === 'LineString';
        const isPolygon = geom.type === 'Polygon';
        const searchKey = global.CartoffCoords
          ? global.CartoffCoords.normalizeSearchText(
            [libelle, typeLabel, isLine ? 'tronçon' : '', isPolygon ? 'zone' : '', props.commune, props.dfci, props.statut]
              .filter(Boolean).join(' ')
          )
          : libelle.toLowerCase();
        return {
          label: libelle + (inactif ? ' (inactif)' : ''),
          sublabel: [typeLabel, isLine ? 'Tronçon' : '', isPolygon ? 'Zone' : '', inactif ? 'Inactif' : ''].filter(Boolean).join(' · '),
          bounds,
          geometry: geom,
          layer: null,
          searchKey
        };
      })
      .filter((entry) => entry.bounds)
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }

  function init(deps) {
    map = deps.map;
    layersRef = deps.layers;
    updateLegendFn = deps.updateLegend;
    findCommuneFn = deps.findCommune;
    latLngToDfciFn = deps.latLngToDfci;
    openMapContextMenuFn = deps.openMapContextMenu;
    setupSearchFn = deps.setupSearch || null;
    sectionEl = deps.sectionEl;
    panelEl = deps.panelEl;
    panelTitleEl = deps.panelTitleEl;
    panelTypeEl = deps.panelTypeEl;
    panelLibelleEl = deps.panelLibelleEl;
    panelSaveBtn = deps.panelSaveBtn;
    panelCancelBtn = deps.panelCancelBtn;
    panelDeleteBtn = deps.panelDeleteBtn;
    drawBannerEl = deps.drawBannerEl;
    drawFinishBtn = deps.drawFinishBtn;
    drawCancelBtn = deps.drawCancelBtn;
    layersContainerEl = deps.layersContainerEl;
    hintEl = deps.hintEl;

    initFromStorage();
    addLazyCheckbox(layersContainerEl);
    buildTypeSelect(panelTypeEl, 'point');

    if (panelSaveBtn) panelSaveBtn.addEventListener('click', savePanel);
    if (panelCancelBtn) panelCancelBtn.addEventListener('click', closePanel);
    if (panelDeleteBtn) panelDeleteBtn.addEventListener('click', deletePanelFeature);
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

    const inactifsCb = document.getElementById('operationShowInactifs');
    if (inactifsCb) {
      inactifsCb.addEventListener('change', (e) => {
        showInactifs = e.target.checked;
        rebuildLayer();
      });
    }
    const exportBtn = document.getElementById('operationExportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportGeoJSON);
  }

  global.CartoffSarOperation = {
    LAYER_NAME,
    STORAGE_KEY,
    init,
    updateVisibility,
    buildMapContextMenu,
    getFeatureFromDomEvent,
    isOperationFeature,
    isDrawOrPanelActive: () => !!(drawState || panelState),
    cancelInteractions,
    getLegendHtml,
    buildSearchEntries,
    rebuildLayer
  };
})(typeof window !== 'undefined' ? window : this);
