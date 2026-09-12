/** Pure model shared by the browser renderer and contract tests. */
export const LEVEL_LABELS = { regions: 'Regiones', provinces: 'Provincias', municipalities: 'Municipios', dm: 'Distritos municipales', sections: 'Secciones', bparajes: 'Barrios y parajes' };
export const LEVEL_KEYS = { regions: 'REG_CODE', provinces: 'PROV_CODE', municipalities: 'MUN_CODE', dm: 'DM_CODE', sections: 'SEC_CODE', bparajes: 'BP_CODE' };
export const missing = value => value == null || String(value).trim() === '' || (typeof value === 'number' && !Number.isFinite(value));
export const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();
export function territoryCode(properties, level) {
  const direct = properties[LEVEL_KEYS[level]] ?? (level === 'sections' ? properties.SECC_CODE : null);
  if (direct != null) return String(direct);
  const parts = { regions: ['REG'], provinces: ['PROV'], municipalities: ['PROV', 'MUN'], dm: ['PROV', 'MUN', 'DM'], sections: ['PROV', 'MUN', 'DM', 'SECC'], bparajes: ['PROV', 'MUN', 'DM', 'SECC', 'BP'] }[level] || [];
  const value = key => properties[key] ?? (key === 'SECC' ? properties.SEC : key === 'REG' ? properties.CODREG ?? properties.RUP : null);
  if (!parts.length || parts.some(key => value(key) == null)) return '';
  return parts.map(key => String(value(key)).padStart(key === 'BP' ? 3 : 2, '0')).join('');
}
export function parentCode(properties, level) {
  return territoryCode(properties, level);
}
export function filterFeatures(layer, { province = '', municipality = '', search = '' } = {}) {
  const query = normalize(search);
  return layer.geojson.features.filter(feature => {
    const p = feature.properties;
    return (!province || parentCode(p, 'provinces') === province) &&
      (!municipality || parentCode(p, 'municipalities') === municipality) &&
      (!query || normalize(`${p.TOPONIMIA ?? p.NAME ?? ''} ${territoryCode(p, layer.id)}`).includes(query));
  });
}
const positions = [0, .13, .25, .38, .5, .63, .75, .88, 1];
const stops = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#fde725'];
const categories = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ab', '#2f4b7c', '#a05195', '#d45087', '#f95d6a', '#ff7c43', '#ffa600'];
function ramp(t) {
  const value = Math.max(0, Math.min(1, t));
  const index = positions.findIndex(position => position >= value);
  if (index <= 0) return stops[0];
  const fraction = (value - positions[index - 1]) / (positions[index] - positions[index - 1]);
  const a = stops[index - 1], b = stops[index];
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - fraction) + parseInt(b.slice(i, i + 2), 16) * fraction).toString(16).padStart(2, '0')).join('');
}
export function colorScale(layer) {
  const values = layer.geojson.features.map(f => f.properties[layer.fillVar]).filter(v => !missing(v));
  const numeric = values.length > 0 && values.every(v => typeof v !== 'boolean' && Number.isFinite(Number(v)));
  const domain = [...new Set(values.map(String))];
  let min = Infinity, max = -Infinity;
  if (numeric) for (const value of values) { min = Math.min(min, Number(value)); max = Math.max(max, Number(value)); }
  const color = value => {
    if (missing(value)) return '#cbd5e1';
    if (numeric) return ramp(max > min ? (Number(value) - min) / (max - min) : .5);
    const index = domain.indexOf(String(value));
    return categories[index] || ramp((index % 13) / 12);
  };
  return { numeric, min, max, domain, color, count: values.length, gradient: stops.join(',') };
}
export function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
