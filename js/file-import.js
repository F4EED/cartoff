/* Import local GeoJSON / KML / KMZ — parsing 100 % hors ligne (voir sources.md) */
(function (global) {
  'use strict';

  const SESSION_KEY = 'cartoff_imported_layers';
  const MAX_SESSION_BYTES = 4 * 1024 * 1024;
  const IMPORT_PREFIX = '[Import] ';

  const IMPORT_PALETTE = [
    { color: '#e65100', fillColor: '#ff9800', fillOpacity: 0.3, weight: 2, radius: 6 },
    { color: '#6a1b9a', fillColor: '#9c27b0', fillOpacity: 0.25, weight: 2, radius: 6 },
    { color: '#00695c', fillColor: '#26a69a', fillOpacity: 0.25, weight: 2, radius: 6 },
    { color: '#c62828', fillColor: '#ef5350', fillOpacity: 0.25, weight: 2, radius: 6 },
    { color: '#1565c0', fillColor: '#42a5f5', fillOpacity: 0.25, weight: 2, radius: 6 },
    { color: '#f57f17', fillColor: '#ffca28', fillOpacity: 0.3, weight: 2, radius: 6 }
  ];

  let map = null;
  let listContainer = null;
  let fileInput = null;
  let pickBtn = null;
  let fitBoundsCheckbox = null;
  let errorEl = null;
  let layersRef = null;
  let layerStylesRef = null;
  let updateLegendFn = null;
  let polygonCanvasRenderer = null;

  const imported = [];
  let colorCursor = 0;
  let restoring = false;

  function showError(msg) {
    if (!errorEl) return;
    if (!msg) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsText(file);
    });
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function extensionOf(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  function baseName(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(0, i) : name;
  }

  function normalizeGeoJSON(data) {
    if (!data || typeof data !== 'object' || !data.type) {
      throw new Error('Format GeoJSON invalide (objet « type » manquant).');
    }
    if (data.type === 'FeatureCollection') {
      if (!Array.isArray(data.features)) {
        throw new Error('FeatureCollection sans tableau « features ».');
      }
      return data;
    }
    if (data.type === 'Feature') {
      return { type: 'FeatureCollection', features: [data] };
    }
    const geomTypes = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
    if (geomTypes.indexOf(data.type) >= 0) {
      return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: data }] };
    }
    throw new Error('Type GeoJSON non reconnu : ' + data.type);
  }

  function hasDrawableGeometry(geojson) {
    return geojson.features.some((f) => f.geometry && f.geometry.type);
  }

  function parseKmlText(text) {
    if (typeof toGeoJSON === 'undefined') {
      throw new Error('Bibliothèque togeojson indisponible.');
    }
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    const parseErr = dom.querySelector('parsererror');
    if (parseErr) {
      throw new Error('Fichier KML XML invalide.');
    }
    return normalizeGeoJSON(toGeoJSON.kml(dom));
  }

  async function parseKmzBuffer(buffer) {
    if (typeof JSZip === 'undefined') {
      throw new Error('Bibliothèque JSZip indisponible.');
    }
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter((n) => {
      const entry = zip.files[n];
      return !entry.dir && n.toLowerCase().endsWith('.kml') && !n.startsWith('__MACOSX/');
    });
    if (!names.length) {
      throw new Error('Aucun fichier KML trouvé dans l\'archive KMZ.');
    }
    names.sort();
    const kmlText = await zip.files[names[0]].async('string');
    return parseKmlText(kmlText);
  }

  async function parseFile(file) {
    const ext = extensionOf(file.name);
    if (ext === 'geojson' || ext === 'json') {
      const text = await readAsText(file);
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('JSON invalide : ' + (e.message || 'erreur de syntaxe'));
      }
      return normalizeGeoJSON(data);
    }
    if (ext === 'kml') {
      return parseKmlText(await readAsText(file));
    }
    if (ext === 'kmz') {
      return parseKmzBuffer(await readAsArrayBuffer(file));
    }
    throw new Error('Format non supporté. Utilisez .geojson, .json, .kml ou .kmz.');
  }

  function uniqueLayerName(base) {
    const used = new Set(imported.map((e) => e.layerName));
    let name = IMPORT_PREFIX + base;
    if (!used.has(name)) return name;
    let n = 2;
    while (used.has(name + ' (' + n + ')')) n++;
    return name + ' (' + n + ')';
  }

  function checkboxIdForLayer(name) {
    return 'chk_' + name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function shouldUseCanvas(geojson) {
    if (!geojson.features || geojson.features.length < 80) return false;
    return geojson.features.some((f) => {
      const t = f.geometry && f.geometry.type;
      return t === 'Polygon' || t === 'MultiPolygon';
    });
  }

  function createLeafletLayer(geojson, style) {
    const opts = {
      style: function () { return style; },
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
          color: style.color,
          fillColor: style.fillColor || style.color,
          fillOpacity: 0.85,
          radius: style.radius || 6,
          weight: 2
        });
      },
      onEachFeature: function (feature, layer) {
        if (!feature.properties) return;
        let popup = '';
        for (const key in feature.properties) {
          if (!Object.prototype.hasOwnProperty.call(feature.properties, key)) continue;
          const val = feature.properties[key];
          if (val == null || val === '') continue;
          popup += '<b>' + key + ':</b> ' + val + '<br>';
        }
        if (popup) layer.bindPopup(popup);
      },
      smoothFactor: 1.5
    };
    if (shouldUseCanvas(geojson) && polygonCanvasRenderer) {
      opts.renderer = polygonCanvasRenderer;
    }
    return L.geoJSON(geojson, opts);
  }

  function persistSession() {
    if (restoring) return;
    try {
      const payload = imported.map((e) => ({
        id: e.id,
        displayBase: e.displayBase,
        colorIndex: e.colorIndex,
        visible: e.visible,
        geojson: e.geojson
      }));
      const json = JSON.stringify(payload);
      if (json.length > MAX_SESSION_BYTES) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      sessionStorage.setItem(SESSION_KEY, json);
    } catch (err) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    }
  }

  function removeEntry(entry) {
    if (entry.leafletLayer && map.hasLayer(entry.leafletLayer)) {
      map.removeLayer(entry.leafletLayer);
    }
    delete layersRef[entry.layerName];
    delete layerStylesRef[entry.layerName];
    const row = document.getElementById('import_row_' + entry.id);
    if (row) row.remove();
    const idx = imported.indexOf(entry);
    if (idx >= 0) imported.splice(idx, 1);
    persistSession();
    if (updateLegendFn) updateLegendFn();
  }

  function renderRow(entry) {
    const row = document.createElement('div');
    row.className = 'import-layer-row';
    row.id = 'import_row_' + entry.id;

    const swatch = document.createElement('span');
    swatch.className = 'import-color-swatch';
    swatch.style.background = entry.style.color;
    swatch.title = 'Couleur du calque';

    const label = document.createElement('label');
    label.className = 'import-layer-label';
    label.htmlFor = checkboxIdForLayer(entry.layerName);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = checkboxIdForLayer(entry.layerName);
    checkbox.checked = entry.visible;
    checkbox.addEventListener('change', function (e) {
      entry.visible = e.target.checked;
      if (entry.visible) {
        if (!map.hasLayer(entry.leafletLayer)) entry.leafletLayer.addTo(map);
      } else if (map.hasLayer(entry.leafletLayer)) {
        map.removeLayer(entry.leafletLayer);
      }
      persistSession();
      if (updateLegendFn) updateLegendFn();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + entry.displayBase));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'import-remove-btn';
    removeBtn.title = 'Supprimer ce calque importé';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function () {
      removeEntry(entry);
    });

    row.appendChild(swatch);
    row.appendChild(label);
    row.appendChild(removeBtn);
    listContainer.appendChild(row);
  }

  function addImportedLayer(displayBase, geojson, options) {
    const opts = options || {};
    const idx = opts.colorIndex != null ? opts.colorIndex : colorCursor;
    if (opts.colorIndex == null) {
      colorCursor++;
    } else {
      colorCursor = Math.max(colorCursor, idx + 1);
    }
    const style = Object.assign({}, IMPORT_PALETTE[idx % IMPORT_PALETTE.length]);

    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

    const layerName = uniqueLayerName(displayBase);
    const leafletLayer = createLeafletLayer(geojson, style);

    const entry = {
      id: id,
      displayBase: displayBase,
      layerName: layerName,
      geojson: geojson,
      style: style,
      colorIndex: idx,
      visible: opts.visible !== false,
      leafletLayer: leafletLayer
    };

    layersRef[layerName] = leafletLayer;
    layerStylesRef[layerName] = style;
    imported.push(entry);
    renderRow(entry);

    if (entry.visible) {
      leafletLayer.addTo(map);
      if (opts.fitBounds !== false && fitBoundsCheckbox && fitBoundsCheckbox.checked && leafletLayer.getBounds) {
        try {
          map.fitBounds(leafletLayer.getBounds(), { padding: [24, 24] });
        } catch (e) { /* bounds vides */ }
      }
    }

    if (!restoring) persistSession();
    if (updateLegendFn) updateLegendFn();
    return entry;
  }

  async function handleFiles(fileList) {
    showError('');
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const errors = [];
    let ok = 0;

    for (const file of files) {
      try {
        const geojson = await parseFile(file);
        if (!hasDrawableGeometry(geojson)) {
          throw new Error('Le fichier ne contient aucune géométrie exploitable.');
        }
        addImportedLayer(baseName(file.name), geojson, { fitBounds: ok === 0 });
        ok++;
      } catch (err) {
        errors.push(file.name + ' : ' + (err.message || String(err)));
      }
    }

    if (errors.length) {
      showError(errors.join('\n'));
    }
    if (fileInput) fileInput.value = '';
  }

  function restoreSession() {
    let raw;
    try {
      raw = sessionStorage.getItem(SESSION_KEY);
    } catch (e) {
      return;
    }
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    if (!Array.isArray(payload) || !payload.length) return;

    restoring = true;
    payload.forEach((item) => {
      try {
        const geojson = normalizeGeoJSON(item.geojson);
        if (!hasDrawableGeometry(geojson)) return;
        colorCursor = Math.max(colorCursor, (item.colorIndex || 0) + 1);
        addImportedLayer(item.displayBase || 'import', geojson, {
          visible: item.visible !== false,
          fitBounds: false,
          colorIndex: item.colorIndex
        });
      } catch (e) {
        console.warn('Import session : calque ignoré', e);
      }
    });
    restoring = false;
  }

  function init(options) {
    map = options.map;
    listContainer = options.listContainer;
    fileInput = options.fileInput;
    pickBtn = options.pickBtn;
    fitBoundsCheckbox = options.fitBoundsCheckbox;
    errorEl = options.errorEl;
    layersRef = options.layers;
    layerStylesRef = options.layerStyles;
    updateLegendFn = options.updateLegend;
    polygonCanvasRenderer = options.polygonCanvasRenderer;

    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function (e) {
        handleFiles(e.target.files);
      });
    }

    restoreSession();
  }

  global.CartoffFileImport = {
    init: init,
    IMPORT_PREFIX: IMPORT_PREFIX
  };
})(typeof window !== 'undefined' ? window : this);
