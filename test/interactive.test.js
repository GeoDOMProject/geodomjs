import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { interactiveData, interactiveDocument, toGeoJSON } from '../src/interactive.js';
import { filterFeatures, colorScale, territoryCode, scriptJson, persistentLabelsEnabled, PERMANENT_LABEL_LIMIT } from '../src/interactive-model.js';

const cache = await mkdtemp(join(tmpdir(), 'geodom-interactive-test-'));
process.env.GEODOM_CACHE_DIR = cache;
test.after(() => rm(cache, {recursive:true, force:true}));

const ring = [[-70,18],[-69,18],[-69,19],[-70,19],[-70,18]];
const feature = (properties, coordinates = ring) => ({ type:'Feature', properties, geometry:{type:'Polygon',coordinates:[coordinates]} });
const collection = features => ({type:'FeatureCollection',features});
const fixtures = {
  RD_BPARAJES: collection([feature({PROV:'05',MUN:'04',DM:'01',SECC:'02',BP:'001',TOPONIMIA:'Paraje con SECC'}),feature({PROV:'05',MUN:'04',DM:'01',SEC:'03',BP:'003',TOPONIMIA:'Paraje con SEC'})]),
  RD_PROV: collection([feature({PROV:'01',TOPONIMIA:'Ázua'}),feature({PROV:'02',TOPONIMIA:'Bahoruco'})]),
  RD_MUN158: collection([feature({PROV:'01',MUN:'01',TOPONIMIA:'Municipio uno'},[[500000,2100000],[501000,2100000],[501000,2101000],[500000,2100000]]),feature({PROV:'02',MUN:'01',TOPONIMIA:'Municipio dos'},[[502000,2100000],[503000,2100000],[503000,2101000],[502000,2100000]])])
};
globalThis.fetch = async url => {
  const id = String(url).split('/').pop().replace('.json','');
  if (!fixtures[id]) throw new Error('Unexpected network: '+url);
  return Response.json(fixtures[id]);
};

test('TopoJSON without quantization uses absolute coordinates and preserves holes', () => {
  const topo = {type:'Topology',objects:{x:{type:'GeometryCollection',geometries:[{type:'Polygon',arcs:[[0],[1]],properties:{x:1}}]}},arcs:[ring,[[-69.8,18.2],[-69.7,18.3],[-69.6,18.2],[-69.8,18.2]]]};
  const geo = toGeoJSON(topo);
  assert.deepEqual(geo.features[0].geometry.coordinates[0],ring);
  assert.equal(geo.features[0].geometry.coordinates.length,2);
});
test('UTM zone 19 is transformed before drawing, with no source mutation', () => {
  const source = structuredClone(fixtures.RD_MUN158);
  const result = toGeoJSON(source,{crs:'EPSG:32619'});
  const [lon,lat] = result.features[0].geometry.coordinates[0][0];
  assert.ok(Math.abs(lon + 69)<1e-9);
  assert.ok(lat>18 && lat<20);
  assert.equal(source.features[0].geometry.coordinates[0][0][0],500000);
  assert.throws(()=>toGeoJSON(source),/fuera de rango/);
});
test('HTML includes all measurements but no executable user markup or external runtime', async () => {
  const value = '</script><script>alert(1)</script>';
  const payload = await interactiveData([{PROV:'01',value}],{level:'provinces',name:'PROV',key:'PROV',fill:'value',title:value});
  const document = await interactiveDocument(payload);
  assert.equal(payload.layers[0].geojson.features[0].properties.value,value);
  assert.ok(!document.includes(value));
  assert.ok(!/<script[^>]+src=/.test(document));
  assert.ok(!/<link[^>]+href=/.test(document));
  assert.match(document,/GeoDOMInteractive.boot/);
  const packed = document.match(/data-encoding="gzip">([^<]+)<\/script>/)[1];
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(packed,'base64'))),payload);
  assert.deepEqual(JSON.parse(scriptJson({value})),{value});
});
test('municipality context never inherits province measurements', async () => {
  const payload = await interactiveData([{PROV:'01',value:42}],{level:'provinces',name:'PROV',key:'PROV',fill:'value'});
  const context = payload.layers.find(l=>l.id==='municipalities');
  assert.equal(context.measured,false);
  assert.equal(context.fillVar,null);
  assert.ok(context.geojson.features.every(f=>!('value' in f.properties)));
  assert.equal(filterFeatures(context,{province:'01'}).length,1);
  assert.equal(territoryCode(context.geojson.features[0].properties,'municipalities'),'0101');
  assert.equal(territoryCode(context.geojson.features[1].properties,'municipalities'),'0201');
});
test('search is accent insensitive and parent filters preserve complete municipal codes', () => {
  const layer={id:'municipalities',geojson:collection([feature({PROV:'01',MUN:'01',TOPONIMIA:'Ázua'}),feature({PROV:'02',MUN:'01',TOPONIMIA:'Otra'})])};
  assert.equal(filterFeatures(layer,{search:'azua'}).length,1);
  assert.equal(filterFeatures(layer,{search:'0201'}).length,1);
  assert.equal(filterFeatures(layer,{province:'02',municipality:'0101'}).length,0);
  assert.equal(territoryCode({PROV:'01',MUN:'02',DM:'03',SEC:'04',BP:'005'},'bparajes'),'01020304005');
  assert.equal(territoryCode({CODREG:'04'},'regions'),'04');
});
test('permanent labels are limited to readable map densities', () => {
  assert.equal(PERMANENT_LABEL_LIMIT, 40);
  assert.equal(persistentLabelsEnabled('name', 40), true);
  assert.equal(persistentLabelsEnabled('both', 41), false);
  assert.equal(persistentLabelsEnabled('', 12), false);
  assert.equal(persistentLabelsEnabled('name', 0), false);
});
test('zero remains measured; missing and categorical values use separate legend semantics', () => {
  const layer={fillVar:'value',geojson:collection([feature({value:0}),feature({value:10}),feature({value:null}),feature({value:''})])};
  const scale=colorScale(layer);
  assert.equal(scale.numeric,true); assert.equal(scale.count,2); assert.equal(scale.min,0); assert.equal(scale.max,10);
  assert.notEqual(scale.color(0),scale.color(null));
  const categorical=colorScale({fillVar:'value',geojson:collection([feature({value:'A'}),feature({value:'B'}),feature({value:null})])});
  assert.equal(categorical.numeric,false); assert.deepEqual(categorical.domain,['A','B']);
  assert.notEqual(categorical.color('A'),categorical.color('B'));
});
test('continuous and discrete palettes are honored by the interactive scale', () => {
  const numericLayer={fillVar:'value',geojson:collection([feature({value:0}),feature({value:10}),feature({value:null})])};
  const continuous=colorScale(numericLayer,{palette:['#000000','#ffffff'],missing:'#123456'});
  assert.equal(continuous.color(0),'#000000');
  assert.equal(continuous.color(10),'#ffffff');
  assert.equal(continuous.color(5),'#808080');
  assert.equal(continuous.color(null),'#123456');
  assert.equal(continuous.gradient,'#000000,#ffffff');

  const discreteLayer={fillVar:'value',geojson:collection([feature({value:'B'}),feature({value:'A'})])};
  const discrete=colorScale(discreteLayer,{palette:['#ff0000','#00ff00'],domain:['A','B']});
  assert.deepEqual(discrete.domain,['A','B']);
  assert.equal(discrete.color('A'),'#ff0000');
  assert.equal(discrete.color('B'),'#00ff00');
});
test('interactive payload retains palette options for the portable viewer', async () => {
  const palette=['#112233','#ddeeff'];
  const payload=await interactiveData([{PROV:'01',value:1}],{level:'provinces',name:'PROV',key:'PROV',fill:'value',palette,missing:'#abcdef',backgroundColor:'#123456',context:false});
  assert.deepEqual(payload.options.palette,palette);
  assert.equal(payload.options.missing,'#abcdef');
  assert.equal(payload.options.backgroundColor,'#123456');
});
test('interactive maps retain duplicate join rejection', async () => {
  await assert.rejects(interactiveData([{PROV:'01',value:1},{PROV:'01',value:2}],{level:'provinces',name:'PROV',key:'PROV',fill:'value'}),/duplicadas/);
});

test('barrio joins preserve measurements with either SEC or SECC source fields', async () => {
  const payload = await interactiveData([{BP_CODE:'05040102001',value:0},{BP_CODE:'05040103003',value:12}],{level:'bparajes',name:'BP_CODE',key:'BP_CODE',fill:'value',context:false});
  assert.deepEqual(payload.layers[0].geojson.features.map(f=>f.properties.value),[0,12]);
});
