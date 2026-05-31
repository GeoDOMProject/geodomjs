import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cleanZoneName,
  cleanProvName,
  detectFill,
  detectLevel,
  fetchAndCache,
  gdCleanZoneName,
  gdDetectFill,
  gdMap,
  gdZones,
  mapData,
  mapSvg,
  normalizeName,
  zones
} from "../src/index.js";

const topojson = (geometries) => ({
  type: "Topology",
  objects: {
    layer: {
      type: "GeometryCollection",
      geometries: geometries.map((properties) => ({
        type: "Polygon",
        arcs: [],
        properties
      }))
    }
  },
  arcs: []
});

const fixtures = {
  "TopoJSON/RD_PROV.json": topojson([
    { PROV_CODE: "01", PROV: "01", TOPONIMIA: "Santo Domingo" },
    { PROV_CODE: "25", PROV: "25", TOPONIMIA: "Santiago" }
  ]),
  "TopoJSON/RD_RUP.json": topojson([
    { REG_CODE: "01", REG: "01", TOPONIMIA: "Cibao Norte" }
  ]),
  "TopoJSON/RD_MUN158.json": topojson([
    { MUN_CODE: "2501", PROV: "25", MUN: "01", ENLACE: "2501", TOPONIMIA: "Santiago" },
    { MUN_CODE: "2401", PROV: "24", MUN: "01", ENLACE: "2401", TOPONIMIA: "La Vega" },
    { MUN_CODE: "0101", PROV: "01", MUN: "01", ENLACE: "0101", TOPONIMIA: "Santo Domingo Este" }
  ]),
  "TopoJSON/RD_DM.json": topojson([
    { DM_CODE: "250101", PROV: "25", MUN: "01", DM: "01", TOPONIMIA: "Pedro Garcia" }
  ]),
  "TopoJSON/RD_SECCIONES.json": topojson([
    { SEC_CODE: "25010101", PROV: "25", MUN: "01", DM: "01", SEC: "01", TOPONIMIA: "Seccion" }
  ]),
  "TopoJSON/RD_BPARAJES.json": topojson([
    { BP_CODE: "25010101001", PROV: "25", MUN: "01", DM: "01", SEC: "01", BP: "001", TOPONIMIA: "Paraje" }
  ]),
  "TopoJSON/RD_MREG.json": topojson([
    { REG_CODE: "01", TOPONIMIA: "Cibao" }
  ])
};

globalThis.fetch = async (url) => {
  const path = String(url).replace("https://geodom-worker.drdsdaniel.workers.dev/", "");
  const body = fixtures[path];
  if (!body) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(body);
};

test("zones returns the R/Python compatible residence zones", () => {
  const result = zones();
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((row) => row.ZONE_NAME), ["Urbana", "Rural"]);
  assert.deepEqual(gdZones(), result);
});

test("normalizeName follows GeoDOM text cleanup basics", () => {
  assert.equal(normalizeName("Provincia de Elías Piña"), "elias pina");
  assert.equal(normalizeName(" La Vega "), "vega");
});

test("cleanZoneName supports scalar and vector inputs", async () => {
  assert.equal(await cleanZoneName("zona urbana"), "Urbana");
  assert.deepEqual(await gdCleanZoneName(["rural", "01"]), ["Rural", "Urbana"]);
});

test("aggregate labels do not fuzzy-match to provinces", async () => {
  assert.equal(await cleanProvName("Otros", { tolerance: 0.5, onError: "na" }), null);
});

test("detectFill prefers informative numeric variables", () => {
  const data = [
    { provincia: "Santo Domingo", poblacion: 2500000, grupo: "A" },
    { provincia: "Santiago", poblacion: 1000000, grupo: "A" },
    { provincia: "La Vega", poblacion: 400000, grupo: "A" }
  ];
  assert.equal(detectFill(data, { exclude: ["provincia"] }), "poblacion");
  assert.equal(gdDetectFill(data, { exclude: ["provincia"] }), "poblacion");
});

test("gdMap is available as the SVG renderer alias", () => {
  assert.equal(gdMap, mapSvg);
});

test("detectLevel recognizes composite municipality code columns", async () => {
  const data = [
    { MUN_CODE: "2501", group: "Cibao Norte" },
    { MUN_CODE: "2401", group: "Cibao Sur" },
    { MUN_CODE: "0101", group: "Ozama" }
  ];

  const result = await detectLevel(data);
  assert.equal(result.level, "municipalities");
  assert.equal(result.name, "MUN_CODE");
  assert.equal(result.key, "MUN_CODE");
});

test("mapData joins categorical fills using composite municipality codes", async () => {
  const data = [
    { MUN_CODE: "2501", region: "Cibao Norte" },
    { MUN_CODE: "2401", region: "Cibao Sur" }
  ];

  const result = await mapData(data, {
    level: "municipalities",
    name: "MUN_CODE",
    key: "MUN_CODE",
    fill: "region"
  });
  const geometries = Object.values(result.data.objects)[0].geometries;
  const santiago = geometries.find((geometry) => geometry.properties.ENLACE === "2501");

  assert.equal(result.fillVar, "region");
  assert.equal(santiago.properties.region, "Cibao Norte");
});

test("mapSvg supports manual categorical colors", async () => {
  const svg = await mapSvg([
    { municipio: "Santiago", alerta: "verde" },
    { municipio: "La Vega", alerta: "amarilla" }
  ], {
    level: "municipalities",
    name: "municipio",
    key: "TOPONIMIA",
    fill: "alerta",
    colors: {
      verde: "#25a55b",
      amarilla: "#ffd23f",
      roja: "#d72638"
    },
    domain: ["verde", "amarilla", "roja"]
  });

  assert.match(svg, /fill="#25a55b"/);
  assert.match(svg, /fill="#ffd23f"/);
  assert.match(svg, /fill="#d72638"/);
  assert.match(svg, />roja<\/text>/);
});

test("Node cache uses filesystem without touching localStorage", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "geodom-cache-"));
  const previousCacheDir = process.env.GEODOM_CACHE_DIR;
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let localStorageAccessed = false;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      localStorageAccessed = true;
      return {
        getItem: () => null,
        setItem: () => {}
      };
    }
  });

  process.env.GEODOM_CACHE_DIR = cacheDir;
  try {
    await fetchAndCache("RD_PROV", { forceDownload: true });
    assert.equal(localStorageAccessed, false);
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "localStorage", previousDescriptor);
    } else {
      delete globalThis.localStorage;
    }
    if (previousCacheDir === undefined) {
      delete process.env.GEODOM_CACHE_DIR;
    } else {
      process.env.GEODOM_CACHE_DIR = previousCacheDir;
    }
    await rm(cacheDir, { recursive: true, force: true });
  }
});
