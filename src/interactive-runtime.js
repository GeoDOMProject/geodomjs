import L from 'leaflet';
import { LEVEL_LABELS, territoryCode, parentCode, filterFeatures, colorScale, missing } from './interactive-model.js';

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function button(text, action) {
  const node = el('button', text); node.type = 'button'; node.addEventListener('click', action); return node;
}
function selectControl(labelText, options) {
  const label = el('label', labelText), select = el('select');
  for (const [value, text] of options) { const option = el('option', text); option.value = value; select.append(option); }
  label.append(select); return { label, select };
}
function valueText(value) {
  if (missing(value)) return 'Sin datos';
  return typeof value === 'number' ? value.toLocaleString('es-DO', { maximumFractionDigits: 6 }) : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export async function boot() {
  const root = document.getElementById('geodom-interactive');
  try {
    const source = document.getElementById('geodom-payload');
    const binary = Uint8Array.from(atob(source.textContent.trim()), ch => ch.charCodeAt(0));
    const stream = new Blob([binary]).stream().pipeThrough(new DecompressionStream('gzip'));
    const payload = JSON.parse(await new Response(stream).text());
    mount(root, payload);
  } catch (error) {
    root.textContent = 'No se pudo abrir el mapa. Usa una versión actual de Chrome, Edge, Firefox o Safari y comprueba que el archivo esté completo.';
    console.error('GeoDOM: no se pudo abrir el documento', error);
  }
}

export function mount(root, payload) {
  const options = payload.options || {};
  root.className = 'gd-viewer';
  const header = el('header', null, 'gd-header');
  header.append(el('h1', options.title || 'Mapa GeoDOM'));
  if (options.subtitle) header.append(el('p', options.subtitle));
  const controls = el('div', null, 'gd-controls');
  const levelControl = selectControl('Capa', payload.layers.map(layer => [layer.id, `${LEVEL_LABELS[layer.id] || layer.id}${layer.measured ? ' · datos' : ' · límites'}`]));
  levelControl.select.value = payload.primary;
  const backgroundControl = selectControl('Fondo', [['none', 'Sin fondo'], ['osm', 'Calles · OpenStreetMap']]);
  const provinceControl = selectControl('Provincia', [['', 'Todas las provincias']]);
  const municipalityControl = selectControl('Municipio', [['', 'Todos los municipios']]);
  const labelControl = selectControl('Etiquetas', [['', 'Al señalar'], ['name', 'Nombre'], ['value', 'Valor'], ['both', 'Nombre y valor']]);
  labelControl.select.value = options.labels === true ? 'name' : options.labels || '';
  const reset = button('Ver todo', () => { provinceControl.select.value = ''; municipalityControl.select.value = ''; search.value = ''; updateMunicipalities(); render(); });
  controls.append(levelControl.label, provinceControl.label, municipalityControl.label, backgroundControl.label, labelControl.label, reset);
  const workspace = el('div', null, 'gd-workspace');
  const canvas = el('div', null, 'gd-canvas'); canvas.setAttribute('aria-label', 'Mapa: usa las flechas para desplazarte y los botones para acercar o alejar');
  const sidebar = el('aside', null, 'gd-sidebar'); sidebar.setAttribute('aria-label', 'Buscar y consultar territorios');
  const searchLabel = el('label', 'Buscar territorio o código');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Nombre o código'; searchLabel.append(search);
  const status = el('p', '', 'gd-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const details = el('section', null, 'gd-details'); details.setAttribute('aria-label', 'Territorio seleccionado'); details.tabIndex = -1;
  const legend = el('section', null, 'gd-legend'); legend.setAttribute('aria-label', 'Leyenda');
  const results = el('div', null, 'gd-results'); results.setAttribute('aria-label', 'Resultados de territorios');
  sidebar.append(searchLabel, status, details, legend, results);
  workspace.append(canvas, sidebar);
  const footer = el('footer', null, 'gd-footer');
  if (options.caption) footer.append(el('p', options.caption));
  footer.append(el('span', `GeoDOM ${payload.version || '1.1.0'} · Los límites sin mediciones se muestran como “Sin datos”.`));
  root.replaceChildren(header, controls, workspace, footer);
  const map = L.map(canvas, { preferCanvas: true, zoomControl: false, scrollWheelZoom: false, minZoom: 5, maxZoom: 18, zoomSnap: .25 });
  map.setView([18.8, -70.3], 7);
  L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  // Wheel zoom starts only after focusing the map, so scrolling the page stays usable.
  canvas.addEventListener('focus', () => map.scrollWheelZoom.enable());
  canvas.addEventListener('blur', () => map.scrollWheelZoom.disable());
  let tiles = null, group = null, selected = null, selectedFeature = null, features = [], layersById = new Map();
  const provinceLayer = payload.layers.find(layer => layer.id === 'provinces');
  const municipalityLayer = payload.layers.find(layer => layer.id === 'municipalities');
  for (const feature of [...(provinceLayer?.geojson.features || [])].sort((a,b) => String(a.properties.TOPONIMIA).localeCompare(String(b.properties.TOPONIMIA)))) {
    const option = el('option', feature.properties.TOPONIMIA); option.value = territoryCode(feature.properties, 'provinces'); provinceControl.select.append(option);
  }
  function current() { return payload.layers.find(layer => layer.id === levelControl.select.value); }
  function updateMunicipalities() {
    const previous = municipalityControl.select.value;
    municipalityControl.select.replaceChildren(new Option('Todos los municipios', ''));
    for (const feature of filterFeatures(municipalityLayer || {geojson:{features:[]}}, { province: provinceControl.select.value }).sort((a,b) => String(a.properties.TOPONIMIA).localeCompare(String(b.properties.TOPONIMIA)))) {
      const option = el('option', feature.properties.TOPONIMIA); option.value = territoryCode(feature.properties, 'municipalities'); municipalityControl.select.append(option);
    }
    municipalityControl.select.value = [...municipalityControl.select.options].some(o => o.value === previous) ? previous : '';
  }
  function background() {
    if (tiles) { map.removeLayer(tiles); tiles = null; }
    if (backgroundControl.select.value === 'osm') {
      tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
      tiles.on('tileerror', () => { status.textContent = 'No se pudo cargar el fondo. Los territorios siguen disponibles; elige “Sin fondo” para continuar sin conexión.'; });
    }
  }
  function showDetails(feature, layer, zoom = false) {
    if (selected) group.resetStyle(selected);
    selected = layer; selectedFeature = feature;
    layer.setStyle({ color: '#0f172a', weight: 3, fillOpacity: .9 }); layer.bringToFront();
    if (zoom) map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 13, animate: false });
    const active = current(), props = feature.properties;
    details.replaceChildren(el('h2', props.TOPONIMIA || props.NAME || 'Territorio'));
    details.append(el('p', `Código: ${territoryCode(props, active.id) || 'No disponible'}`));
    details.append(el('p', active.measured ? `${active.fillVar}: ${valueText(props[active.fillVar])}` : 'Sin datos para este nivel. Esta capa muestra límites geográficos.', 'gd-value'));
    details.append(button('Acercar al territorio', () => map.fitBounds(layer.getBounds(), { padding: [28,28], maxZoom: 13 })));
    if (active.id === 'provinces' && municipalityLayer) details.append(button('Ver municipios', () => {
      levelControl.select.value = 'municipalities'; provinceControl.select.value = territoryCode(props, 'provinces'); municipalityControl.select.value = ''; search.value = ''; updateMunicipalities(); render();
    }));
    if (active.id === 'municipalities' && !['regions', 'provinces', 'municipalities'].includes(payload.primary)) details.append(button(`Ver ${LEVEL_LABELS[payload.primary]?.toLowerCase() || 'detalle'}`, () => {
      levelControl.select.value = payload.primary; provinceControl.select.value = parentCode(props, 'provinces'); updateMunicipalities(); municipalityControl.select.value = territoryCode(props, 'municipalities'); search.value = ''; render();
    }));
    const more = el('details'), summary = el('summary', 'Ver atributos'); more.append(summary);
    const dl = el('dl');
    for (const [key, value] of Object.entries(props)) { dl.append(el('dt', key), el('dd', valueText(value))); }
    more.append(dl); details.append(more);
    details.focus({ preventScroll: true });
    sidebar.scrollTop = 0;
  }
  function renderLegend(active, scale) {
    legend.replaceChildren(el('h2', active.measured ? active.fillVar : 'Límites geográficos'));
    if (scale.numeric) {
      const gradient = el('div', null, 'gd-gradient'); gradient.style.background = `linear-gradient(to right,${scale.gradient})`;
      legend.append(gradient, el('p', `${valueText(scale.min)} — ${valueText(scale.max)}`));
    } else if (active.measured) {
      const categoryList = el('div', null, 'gd-categories');
      for (const category of scale.domain) { const item = el('p'); const swatch = el('span', '', 'gd-swatch'); swatch.style.backgroundColor = scale.color(category); item.append(swatch, document.createTextNode(category)); categoryList.append(item); }
      legend.append(categoryList);
    }
    const absent = el('p'); const swatch = el('span', '', 'gd-swatch'); swatch.style.backgroundColor = '#cbd5e1'; absent.append(swatch, document.createTextNode('Sin datos')); legend.append(absent);
    if (active.measured) legend.append(el('small', 'Escala común a toda la capa; se conserva al filtrar.'));
  }
  function render(fit = true) {
    const active = current();
    provinceControl.label.hidden = !provinceLayer || ['regions', 'provinces'].includes(active.id);
    municipalityControl.label.hidden = !municipalityLayer || ['regions', 'provinces', 'municipalities'].includes(active.id);
    features = filterFeatures(active, { province: provinceControl.label.hidden ? '' : provinceControl.select.value, municipality: municipalityControl.label.hidden ? '' : municipalityControl.select.value, search: search.value });
    const scale = colorScale(active);
    if (group) map.removeLayer(group);
    selected = null; selectedFeature = null; layersById = new Map();
    details.replaceChildren(el('p', 'Selecciona un territorio en el mapa o en los resultados para consultar sus datos.'));
    group = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: feature => ({ color: '#fff', weight: 1, fillColor: scale.color(feature.properties[active.fillVar]), fillOpacity: .8 }),
      onEachFeature(feature, layer) {
        layersById.set(feature, layer);
        const p = feature.properties, code = territoryCode(p, active.id), name = p.TOPONIMIA || p.NAME || 'Territorio';
        const tooltip = el('div'); tooltip.append(el('strong', name), el('div', code), el('div', active.measured ? `${active.fillVar}: ${valueText(p[active.fillVar])}` : 'Sin datos'));
        const permanent = Boolean(labelControl.select.value) && features.length <= 300;
        if (permanent) {
          tooltip.replaceChildren(document.createTextNode(labelControl.select.value === 'value' ? valueText(p[active.fillVar]) : labelControl.select.value === 'both' ? `${name}: ${valueText(p[active.fillVar])}` : name));
        }
        layer.bindTooltip(tooltip, { sticky: !permanent, permanent, direction: permanent ? 'center' : 'auto', className: permanent ? 'gd-label' : '' });
        layer.on({ click: () => showDetails(feature, layer), mouseover: () => { if (selected !== layer) layer.setStyle({ weight: 2, color: '#475569' }); }, mouseout: () => { if (selected !== layer) group.resetStyle(layer); } });
      }
    }).addTo(map);
    const matched = features.filter(f => active.measured && !missing(f.properties[active.fillVar])).length;
    status.textContent = `${features.length.toLocaleString('es-DO')} territorios · ${matched.toLocaleString('es-DO')} con datos.${labelControl.select.value && features.length > 300 ? ' Las etiquetas aparecen al señalar; filtra a 300 territorios o menos para mostrarlas todas.' : ''}`;
    if (fit && group.getBounds().isValid()) map.fitBounds(group.getBounds(), { padding: [20,20], maxZoom: 13, animate: false });
    renderLegend(active, scale);
    results.replaceChildren(el('h2', 'Territorios'));
    for (const feature of features.slice(0, 30)) {
      const p = feature.properties;
      const result = button(`${p.TOPONIMIA || p.NAME || 'Territorio'} · ${territoryCode(p, active.id)}`, () => showDetails(feature, layersById.get(feature), true));
      results.append(result);
    }
    if (features.length > 30) results.append(el('small', 'Se muestran los primeros 30 resultados. Escribe un nombre o código para precisar la búsqueda.'));
    if (!features.length) results.append(el('p', 'No hay territorios que coincidan. Borra la búsqueda o pulsa “Ver todo”.'));
  }
  levelControl.select.addEventListener('change', () => { search.value = ''; provinceControl.select.value = ''; municipalityControl.select.value = ''; updateMunicipalities(); render(); });
  provinceControl.select.addEventListener('change', () => { municipalityControl.select.value = ''; search.value = ''; updateMunicipalities(); render(); });
  municipalityControl.select.addEventListener('change', () => { search.value = ''; render(); });
  backgroundControl.select.addEventListener('change', background);
  labelControl.select.addEventListener('change', () => render(false));
  let searchTimer;
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => render(), 180); });
  backgroundControl.select.value = options.background === 'osm' ? 'osm' : 'none';
  updateMunicipalities(); background(); render();
  const observer = new ResizeObserver(() => map.invalidateSize({ pan: false })); observer.observe(canvas);
  return { map, destroy() { clearTimeout(searchTimer); observer.disconnect(); map.remove(); root.replaceChildren(); } };
}
