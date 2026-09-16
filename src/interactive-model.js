import { normalizeHexColor, resolvePalette, paletteColor } from './palettes.js';

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
export function colorScale(layer, options = {}) {
  const values = layer.geojson.features.map(f => f.properties[layer.fillVar]).filter(v => !missing(v));
  const numeric = values.length > 0 && values.every(v => typeof v !== 'boolean' && Number.isFinite(Number(v)));
  const observed = [...new Set(values.map(String))];
  const requestedDomain = options.domain ? [...options.domain].map(String) : [];
  const domain = [...new Set([...requestedDomain, ...observed])];
  const palette = resolvePalette(options.palette, { numeric });
  const colorOverrides = options.colors instanceof Map ? options.colors : new Map(Object.entries(options.colors || {}));
  const missingColor = normalizeHexColor(options.missing || '#cbd5e1', 'El color sin datos');
  let min = Infinity, max = -Infinity;
  if (numeric) for (const value of values) { min = Math.min(min, Number(value)); max = Math.max(max, Number(value)); }
  const color = value => {
    if (missing(value)) return missingColor;
    if (numeric) return paletteColor(palette, max > min ? (Number(value) - min) / (max - min) : .5);
    const index = domain.indexOf(String(value));
    return normalizeHexColor(colorOverrides.get(String(value)) || palette[index % palette.length], `El color de ${value}`);
  };
  return { numeric, min, max, domain, color, count: values.length, gradient: palette.join(','), missing: missingColor };
}
export function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
