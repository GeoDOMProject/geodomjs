import proj4 from 'proj4';
import { feature as topoFeature } from 'topojson-client';
import { mapData, provinces, municipalities } from './index.js';
import { scriptJson } from './interactive-model.js';
import { runtimeJs, runtimeCss } from './runtime-assets.js';

const UTM19 = '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs';

/** Convert a GeoDOM polygon layer into WGS84 GeoJSON without mutating the cache. */
export function toGeoJSON(source, { crs = 'EPSG:4326' } = {}) {
  let collection = source;
  if (source?.type === 'Topology') {
    const objects = Object.values(source.objects || {});
    if (objects.length !== 1) throw new Error('La capa debe contener un solo objeto territorial.');
    collection = topoFeature(source, objects[0]);
  }
  if (collection?.type === 'Feature') collection = { type: 'FeatureCollection', features: [collection] };
  if (collection?.type !== 'FeatureCollection' || !collection.features.length) throw new Error('La capa no contiene geometrías territoriales.');
  const transform = crs === 'EPSG:32619' ? proj4(UTM19, 'EPSG:4326') : crs === 'EPSG:4326' ? null : proj4(crs, 'EPSG:4326');
  function coordinates(value) {
    if (!Array.isArray(value) || !value.length) throw new Error('Geometría vacía o inválida.');
    if (typeof value[0] !== 'number') return value.map(coordinates);
    const point = transform ? transform.forward(value.slice(0, 2)) : value.slice(0, 2);
    if (!point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error('Coordenadas fuera de rango; comprueba el sistema de referencia de la capa.');
    return point.map(value => Math.round(value * 1e6) / 1e6);
  }
  return { type: 'FeatureCollection', features: collection.features.map((f, index) => {
    if (!['Polygon', 'MultiPolygon'].includes(f.geometry?.type)) throw new Error('El visor admite polígonos y multipolígonos.');
    return { type: 'Feature', id: String(index), properties: { ...f.properties }, geometry: { type: f.geometry.type, coordinates: coordinates(f.geometry.coordinates) } };
  }) };
}

/** Prepare the measured layer and province/municipality context for portable maps. */
export async function interactiveData(data, options = {}) {
  const joined = await mapData(data, options);
  const sourceCrs = options.crs || (joined.geoLevel === 'municipalities' ? 'EPSG:32619' : 'EPSG:4326');
  const primary = { id: joined.geoLevel, fillVar: joined.fillVar, measured: true, geojson: toGeoJSON(joined.data, { crs: sourceCrs }) };
  const layers = [primary];
  if (options.context !== false) {
    for (const [id, getter, crs] of [['provinces', provinces, 'EPSG:4326'], ['municipalities', municipalities, 'EPSG:32619']]) {
      if (id !== primary.id) layers.push({ id, fillVar: null, measured: false, geojson: toGeoJSON(await getter(), { crs }) });
    }
  }
  return { version: '1.1.1', primary: primary.id, layers, options: {
    title: options.title || 'Mapa GeoDOM', subtitle: options.subtitle || '', caption: options.caption || '', labels: options.labels || false,
    background: options.background === 'osm' ? 'osm' : 'none'
  } };
}

/** Encode prepared layers and the bundled renderer in a standalone HTML document. */
export async function interactiveDocument(payload) {
  if (!payload?.layers?.length) throw new Error('El mapa no contiene capas.');
  const title = String(payload.options?.title || 'Mapa GeoDOM').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compressed = new Uint8Array(await new Response(new Blob([scriptJson(payload)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary = '';
  for (let i = 0; i < compressed.length; i += 8192) binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
  const encoded = btoa(binary);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="GeoDOM 1.1.1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https://tile.openstreetmap.org; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>${runtimeCss}</style></head><body><main id="geodom-interactive">Abriendo mapa...</main><script id="geodom-payload" type="application/octet-stream" data-encoding="gzip">${encoded}</script><script>${runtimeJs}\nGeoDOMInteractive.boot();</script></body></html>`;
}
export async function mapInteractive(data, options = {}) {
  return interactiveDocument(await interactiveData(data, options));
}
export const gdMapInteractive = mapInteractive;

/** Mount a viewer with isolated styles. Calling destroy removes all listeners. */
export async function mountInteractiveMap(container, data, options = {}) {
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) throw new Error('No se encontró el contenedor del mapa.');
  const payload = await interactiveData(data, options);
  const { mountInteractiveViewer } = await import('../dist/interactive-viewer.js');
  const controller = mountInteractiveViewer(target, payload);
  return { ...controller, html: await interactiveDocument(payload) };
}
