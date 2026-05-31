const BASE_DATA_URL = "https://geodom-worker.drdsdaniel.workers.dev/";
const CACHE_DIR_NAME = "geodom";

const memoryCache = new Map();

const DATA_IDS = {
  provinces: "RD_PROV",
  regions: "RD_RUP",
  municipalities: "RD_MUN158",
  dm: "RD_DM",
  sections: "RD_SECCIONES",
  bparajes: "RD_BPARAJES",
  macroregions: "RD_MREG"
};

const LEVELS = ["regions", "provinces", "municipalities", "dm", "sections", "bparajes"];
const LEVEL_COL_NAMES = {
  regions: "Region",
  provinces: "Provincia",
  municipalities: "Municipio",
  dm: "Distrito_Municipal",
  sections: "Seccion",
  bparajes: "Barrio_Paraje"
};

const CODE_WIDTHS = {
  REG_CODE: 2,
  PROV_CODE: 2,
  MUN_CODE: 4,
  DM_CODE: 6,
  SEC_CODE: 8,
  SECC_CODE: 8,
  BP_CODE: 11,
  PROV: 2,
  REG: 2,
  CODREG: 2,
  MUN: 2,
  DM: 2,
  SEC: 2,
  SECC: 2,
  BP: 3
};

const LEVEL_DETAIL_RANK = {
  zones: 0,
  regions: 1,
  provinces: 2,
  municipalities: 3,
  dm: 4,
  sections: 5,
  bparajes: 6
};

const LEVEL_KEY_CANDIDATES = {
  regions: ["REG_CODE", "CODREG", "REG", "TOPONIMIA"],
  provinces: ["PROV_CODE", "PROV", "TOPONIMIA"],
  municipalities: ["MUN_CODE", "TOPONIMIA"],
  dm: ["DM_CODE", "TOPONIMIA"],
  sections: ["SEC_CODE", "SECC_CODE", "TOPONIMIA"],
  bparajes: ["BP_CODE", "TOPONIMIA"],
  zones: ["ZONE_ID", "ZONE_CODE", "TOPONIMIA", "ZONE_NAME"]
};

const CATEGORICAL_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#e15759",
  "#76b7b2",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ab",
  "#2f4b7c",
  "#a05195",
  "#d45087",
  "#f95d6a",
  "#ff7c43",
  "#ffa600"
];

const NON_GEOGRAPHIC_NAMES = new Set([
  "otros",
  "otras",
  "other",
  "others",
  "resto",
  "demas",
  "demas provincias",
  "no especificado",
  "sin especificar",
  "no aplica",
  "nacional",
  "total"
]);

function isNode() {
  return typeof process !== "undefined" && !!process.versions?.node;
}

function cacheKey(kind, id) {
  return `${kind}:${id}`;
}

async function readPersistentCache(key) {
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
    const value = localStorage.getItem(`geodom:${key}`);
    return value ? JSON.parse(value) : null;
  }

  if (!isNode()) return null;

  try {
    const fsModule = "node:fs/promises";
    const pathModule = "node:path";
    const { readFile } = await import(/* @vite-ignore */ fsModule);
    const { join } = await import(/* @vite-ignore */ pathModule);
    const file = join(process.env.GEODOM_CACHE_DIR || join(process.cwd(), `.${CACHE_DIR_NAME}`), `${encodeURIComponent(key)}.json`);
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writePersistentCache(key, value) {
  if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
    localStorage.setItem(`geodom:${key}`, JSON.stringify(value));
    return;
  }

  if (!isNode()) return;

  try {
    const fsModule = "node:fs/promises";
    const pathModule = "node:path";
    const { mkdir, writeFile } = await import(/* @vite-ignore */ fsModule);
    const { join } = await import(/* @vite-ignore */ pathModule);
    const dir = process.env.GEODOM_CACHE_DIR || join(process.cwd(), `.${CACHE_DIR_NAME}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${encodeURIComponent(key)}.json`), JSON.stringify(value), "utf8");
  } catch {
    // Cache is opportunistic; failed writes must not break data access.
  }
}

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error("Este entorno no tiene fetch disponible. Use Node >=18 o un polyfill de fetch.");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error descargando ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function getCachedJson(key, url, { forceDownload = false, verbose = false } = {}) {
  if (!forceDownload && memoryCache.has(key)) return memoryCache.get(key);

  if (!forceDownload) {
    const cached = await readPersistentCache(key);
    if (cached !== null) {
      if (verbose) console.info(`Cargando '${key}' desde cache local.`);
      memoryCache.set(key, cached);
      return cached;
    }
  }

  if (verbose) console.info(`Descargando '${key}'.`);
  const data = await fetchJson(url);
  memoryCache.set(key, data);
  await writePersistentCache(key, data);
  return data;
}

export async function fetchAndCache(id, { dataType = "TopoJSON", forceDownload = false, verbose = false } = {}) {
  const path = dataType === "TopoJSON" ? `TopoJSON/${id}.json` : `datasets/${id}.json`;
  return getCachedJson(cacheKey(dataType, id), `${BASE_DATA_URL}${path}`, { forceDownload, verbose });
}

export async function getDataset(id, options = {}) {
  return fetchAndCache(id, { ...options, dataType: "dataset" });
}

function maybeDropGeometry(data, sf) {
  if (sf !== false) return data;
  return rows(data);
}

async function geoData(id, options = {}) {
  const data = await fetchAndCache(id, options);
  return maybeDropGeometry(data, options.sf);
}

export async function provinces({ id = DATA_IDS.provinces, sf = true, reg = null, verbose = false, forceDownload = false } = {}) {
  const data = await geoData(id, { sf, verbose, forceDownload });
  if (!reg || String(reg).toLowerCase() !== "rup" || sf !== false) return data;

  try {
    const territorial = rows(await getDataset("division_territorial_rd_ley_345_22", { verbose, forceDownload }));
    const regMap = new Map(territorial.map((row) => [String(row.PROV_CODE), row.REG_CODE]));
    return data.map((row) => ({ ...row, REG_CODE: regMap.get(String(row.PROV)) ?? null }));
  } catch {
    return data;
  }
}

export async function regions({ id = DATA_IDS.regions, sf = true, verbose = false, forceDownload = false } = {}) {
  return geoData(id, { sf, verbose, forceDownload });
}

export async function municipalities({ id = DATA_IDS.municipalities, sf = true, verbose = false, forceDownload = false } = {}) {
  return geoData(id, { sf, verbose, forceDownload });
}

export async function dm({ id = DATA_IDS.dm, sf = true, verbose = false, forceDownload = false } = {}) {
  return geoData(id, { sf, verbose, forceDownload });
}

export async function sections({ id = DATA_IDS.sections, sf = true, verbose = false, forceDownload = false } = {}) {
  return geoData(id, { sf, verbose, forceDownload });
}

export async function bparajes({ id = DATA_IDS.bparajes, sf = true, verbose = false, forceDownload = false } = {}) {
  return geoData(id, { sf, verbose, forceDownload });
}

export async function macroregions({ id = DATA_IDS.macroregions, sf = true, verbose = false, forceDownload = false } = {}) {
  return geoData(id, { sf, verbose, forceDownload });
}

export function zones() {
  return [
    { ZONE_ID: "01", ZONE_CODE: "URB", ZONE_NAME: "Urbana", TOPONIMIA: "Urbana" },
    { ZONE_ID: "02", ZONE_CODE: "RUR", ZONE_NAME: "Rural", TOPONIMIA: "Rural" }
  ];
}

function isMissing(value) {
  return value === null || value === undefined || Number.isNaN(value);
}

function asArray(value) {
  if (typeof value === "string" || isMissing(value)) return { values: [value], scalar: true };
  if (Array.isArray(value)) return { values: value, scalar: false };
  return { values: Array.from(value), scalar: false };
}

function restoreShape(values, scalar) {
  return scalar ? values[0] : values;
}

export function normalizeName(name) {
  if (isMissing(name)) return "_na_";
  let text = String(name).toLowerCase().trim().replace(/\s+/g, " ");
  text = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const prefixes = [
    /^region ?/i,
    /^provincia ?de ?/i,
    /^provincia ?/i,
    /^municipio ?/i,
    /^ayuntamiento ?de ?/i,
    / \(d\.? ?m\.?\)/i,
    / [(]?zona urbana[)]?/i,
    /^el /i,
    /^la[s]? ?/i,
    /^los ?/i,
    /^de[l]? ?/i
  ];
  for (const prefix of prefixes) text = text.replace(prefix, "");
  text = text.replace(/\bde\b/gi, "").replace(/\s+/g, " ").trim();
  if (text !== "_na_") text = text.replace(/[^0-9a-z ]/gi, "");
  return text.replace(/\s+/g, " ").trim();
}

function codeValue(value, column) {
  if (isMissing(value)) return "";
  let text = String(value).trim().replace(/\.0$/, "");
  const width = CODE_WIDTHS[column];
  if (width && /^\d+$/.test(text)) text = text.padStart(width, "0");
  return text;
}

function composeId(row, columns) {
  return columns.map((column) => codeValue(row[column], column)).join("");
}

function firstValue(row, columns) {
  for (const column of columns) {
    if (column in row && !isMissing(row[column])) return row[column];
  }
  return undefined;
}

function joinValueForKey(row, key) {
  if (!row || !key) return undefined;
  if (key in row && !isMissing(row[key])) return key.toUpperCase().endsWith("_CODE") ? codeValue(row[key], key) : row[key];

  const upper = key.toUpperCase();
  if (upper === "REG_CODE" || upper === "CODREG") {
    return codeValue(firstValue(row, ["REG_CODE", "CODREG", "REG"]), "REG_CODE");
  }
  if (upper === "PROV_CODE" || upper === "PROV") {
    return codeValue(firstValue(row, ["PROV_CODE", "PROV"]), "PROV_CODE");
  }
  if (upper === "MUN_CODE") {
    const direct = firstValue(row, ["MUN_CODE"]);
    return !isMissing(direct) ? codeValue(direct, "MUN_CODE") : composeId(row, ["PROV", "MUN"]);
  }
  if (upper === "DM_CODE") {
    const direct = firstValue(row, ["DM_CODE"]);
    return !isMissing(direct) ? codeValue(direct, "DM_CODE") : composeId(row, ["PROV", "MUN", "DM"]);
  }
  if (upper === "SEC_CODE" || upper === "SECC_CODE") {
    const direct = firstValue(row, ["SEC_CODE", "SECC_CODE"]);
    if (!isMissing(direct)) return codeValue(direct, upper);
    const secCol = "SEC" in row ? "SEC" : ("SECC" in row ? "SECC" : "SEC");
    return composeId(row, ["PROV", "MUN", "DM", secCol]);
  }
  if (upper === "BP_CODE") {
    const direct = firstValue(row, ["BP_CODE"]);
    return !isMissing(direct) ? codeValue(direct, "BP_CODE") : composeId(row, ["PROV", "MUN", "DM", "SEC", "BP"]);
  }
  return row[key];
}

function rows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (data.type === "FeatureCollection") return data.features.map((feature) => ({ ...(feature.properties || {}) }));
  if (data.type === "Topology") {
    return Object.values(data.objects || {}).flatMap((object) =>
      (object.geometries || []).map((geometry) => ({ ...(geometry.properties || {}) }))
    );
  }
  return [data];
}

function firstExisting(columns, choices) {
  return choices.find((choice) => columns.includes(choice));
}

function fallbackAliasData(fallbackData, idCol, nameCol, officialCol, idParts) {
  const source = rows(fallbackData);
  if (source.length === 0) return [];
  const columns = Object.keys(source[0]);
  const parts = [];
  for (const part of idParts) {
    if (part === "SEC" || part === "SECC") {
      const secCol = firstExisting(columns, ["SEC", "SECC"]);
      if (secCol) parts.push(secCol);
    } else if (columns.includes(part)) {
      parts.push(part);
    }
  }

  return source
    .map((row, index) => ({
      [idCol]: parts.length ? composeId(row, parts) : String(row[idCol] ?? index),
      [nameCol]: row[officialCol] ?? row[nameCol] ?? Object.values(row)[0]
    }))
    .filter((row) => !isMissing(row[nameCol]));
}

async function aliasData(aliasId, idCol, nameCol, fallbackFetcher, officialCol, idParts) {
  try {
    const data = rows(await getDataset(aliasId));
    if (data.length && idCol in data[0] && nameCol in data[0]) {
      return data.map((row) => ({ [idCol]: row[idCol], [nameCol]: row[nameCol] }));
    }
  } catch {
    // Use fallback below.
  }
  const fallback = fallbackFetcher ? await fallbackFetcher({ sf: false }).catch(() => []) : [];
  return fallbackAliasData(fallback, idCol, nameCol, officialCol, idParts);
}

function validateCleanParams(tolerance, onError) {
  if (typeof tolerance !== "number" || tolerance < 0 || tolerance > 1) {
    throw new Error("tolerance debe ser un numero entre 0 y 1");
  }
  if (!["fail", "na", "omit"].includes(onError)) {
    throw new Error("onError debe ser uno de: 'fail', 'na', 'omit'");
  }
}

function jaroWinklerDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return 1;
  const matchDistance = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches += 1;
        break;
      }
    }
  }

  if (!matches) return 1;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix += 1;
  return 1 - (jaro + prefix * 0.1 * (1 - jaro));
}

function noMatch(currentName, levelLabel, onError, message, hint) {
  if (onError === "na") return null;
  if (onError === "omit") return currentName;
  throw new Error(`${message || `${levelLabel} name '${currentName}' not matched`}${hint ? `. ${hint}` : ""}`);
}

function ambiguous(currentName, officials, levelLabel, parentHint, onError) {
  if (onError === "na") return null;
  if (onError === "omit") return currentName;
  const sample = officials.slice(0, 3).join("', '");
  throw new Error(`${levelLabel} '${currentName}' is ambiguous: ${officials.length} matches found. Matches include: '${sample}'${parentHint ? `. ${parentHint}` : ""}`);
}

async function resolveParentIds(parentName, aliases, idCol, nameCol) {
  if (parentName === null || parentName === undefined) return null;
  const parentClean = normalizeName(parentName);
  const lookup = aliases.map((row) => ({ id: String(row[idCol]), clean: normalizeName(row[nameCol]) }));
  const exact = lookup.filter((row) => row.clean === parentClean);
  if (exact.length) return [...new Set(exact.map((row) => row.id))];
  const fuzzy = lookup
    .map((row) => ({ ...row, dist: jaroWinklerDistance(parentClean, row.clean) }))
    .filter((row) => row.dist <= 0.25)
    .sort((a, b) => a.dist - b.dist);
  return fuzzy.length ? [...new Set(fuzzy.map((row) => row.id))] : null;
}

function genericCleanNames(names, aliases, config) {
  const {
    idCol,
    nameCol,
    levelLabel,
    prefixRegex,
    codeRegex,
    parentFilterIds,
    parentPrefixLen,
    parentHint,
    tolerance = 0.25,
    onError = "fail"
  } = config;
  validateCleanParams(tolerance, onError);
  const { values, scalar } = asArray(names);

  const officialById = new Map();
  for (const row of aliases) {
    const id = String(row[idCol]);
    if (!officialById.has(id)) officialById.set(id, row[nameCol]);
  }

  let lookup = aliases.map((row) => {
    const id = String(row[idCol]);
    return {
      id,
      clean: normalizeName(row[nameCol]),
      rawLower: String(row[nameCol]).toLowerCase(),
      official: officialById.get(id)
    };
  });
  if (parentFilterIds && parentPrefixLen) {
    const parentSet = new Set(parentFilterIds.map(String));
    lookup = lookup.filter((row) => parentSet.has(row.id.slice(0, parentPrefixLen)));
  }

  const results = values.map((currentName) => {
    if (isMissing(currentName)) return null;
    const raw = String(currentName);
    const clean = normalizeName(raw);
    if (!clean || clean === "_na_") return noMatch(currentName, levelLabel, onError, `${levelLabel} name is empty`);
    if (NON_GEOGRAPHIC_NAMES.has(clean)) {
      return noMatch(
        currentName,
        levelLabel,
        onError,
        `${levelLabel} name '${currentName}' is an aggregate or non-geographic label`
      );
    }

    if (codeRegex?.test(raw.trim())) {
      const hit = lookup.find((row) => row.id === raw.trim());
      return hit ? hit.official : noMatch(currentName, levelLabel, onError, `${levelLabel} code '${currentName}' not found`);
    }

    const exact = lookup.filter((row) => row.clean === clean);
    if (exact.length) {
      const officials = [...new Set(exact.map((row) => row.official).filter(Boolean))];
      if (officials.length === 1) return officials[0];
      const rawExact = exact.filter((row) => row.rawLower === raw.toLowerCase());
      const rawOfficials = [...new Set(rawExact.map((row) => row.official).filter(Boolean))];
      if (rawOfficials.length === 1) return rawOfficials[0];
      return ambiguous(currentName, officials, levelLabel, parentHint, onError);
    }

    const noPrefix = prefixRegex ? clean.replace(prefixRegex, "") : clean;
    if (noPrefix !== clean) {
      const prefixExact = lookup.filter((row) => row.clean === noPrefix);
      const officials = [...new Set(prefixExact.map((row) => row.official).filter(Boolean))];
      if (officials.length === 1) return officials[0];
      if (officials.length > 1) return ambiguous(currentName, officials, levelLabel, parentHint, onError);
    }

    const starts = lookup.filter((row) => row.clean.startsWith(noPrefix)).sort((a, b) => a.clean.length - b.clean.length);
    if (starts.length) return starts[0].official;

    const reverse = lookup.filter((row) => noPrefix.startsWith(row.clean)).sort((a, b) => b.clean.length - a.clean.length);
    if (reverse.length) return reverse[0].official;

    const fuzzy = lookup
      .filter((row) => row.clean !== "_na_")
      .map((row) => ({ ...row, dist: jaroWinklerDistance(noPrefix, row.clean) }))
      .sort((a, b) => a.dist - b.dist || a.clean.length - b.clean.length);
    const best = fuzzy[0];
    if (best && best.dist <= tolerance) return best.official;
    return noMatch(
      currentName,
      levelLabel,
      onError,
      `${levelLabel} name '${currentName}' could not be matched with tolerance ${tolerance}`,
      best ? `Best match was '${best.official}' with distance ${best.dist.toFixed(3)}` : undefined
    );
  });

  return restoreShape(results, scalar);
}

async function provinceAliases() {
  return aliasData("provincias_alias", "PROV_ID", "PROV_NAME", provinces, "TOPONIMIA", ["PROV"]);
}

async function regionAliases() {
  return aliasData("regiones_alias", "REG_ID", "REG_NAME", regions, "TOPONIMIA", ["CODREG"]);
}

async function municipalityAliases() {
  return aliasData("municipios_alias", "MUN_ID", "MUN_NAME", municipalities, "TOPONIMIA", ["PROV", "MUN"]);
}

async function dmAliases() {
  return aliasData("dm_alias", "DM_ID", "DM_NAME", dm, "TOPONIMIA", ["PROV", "MUN", "DM"]);
}

async function sectionAliases() {
  return aliasData("sections_alias", "SEC_ID", "SEC_NAME", sections, "TOPONIMIA", ["PROV", "MUN", "DM", "SEC"]);
}

async function bparajeAliases() {
  return aliasData("bparajes_alias", "BP_ID", "BP_NAME", bparajes, "TOPONIMIA", ["PROV", "MUN", "DM", "SEC", "BP"]);
}

async function zoneAliases() {
  try {
    const aliases = await aliasData("zones_alias", "ZONE_ID", "ZONE_NAME", null, "TOPONIMIA", ["ZONE_ID"]);
    if (aliases.length) return aliases;
  } catch {
    // Use static fallback below.
  }
  return zones().map((row) => ({ ZONE_ID: row.ZONE_ID, ZONE_NAME: row.ZONE_NAME }));
}

export async function cleanProvName(names, { tolerance = 0.25, onError = "fail" } = {}) {
  return genericCleanNames(names, await provinceAliases(), {
    idCol: "PROV_ID",
    nameCol: "PROV_NAME",
    levelLabel: "Province",
    prefixRegex: /^(provincia|prov)\.?\s+/i,
    codeRegex: /^\d{2}$/,
    tolerance,
    onError
  });
}

export async function cleanRegionName(names, { tolerance = 0.25, onError = "fail" } = {}) {
  return genericCleanNames(names, await regionAliases(), {
    idCol: "REG_ID",
    nameCol: "REG_NAME",
    levelLabel: "Region",
    prefixRegex: /^(region|reg)\.?\s+/i,
    codeRegex: /^\d{2}$/,
    tolerance,
    onError
  });
}

export async function cleanMunicipalityName(names, { province = null, tolerance = 0.25, onError = "fail" } = {}) {
  const aliases = await municipalityAliases();
  const parentIds = province ? await resolveParentIds(province, await provinceAliases(), "PROV_ID", "PROV_NAME") : null;
  return genericCleanNames(names, aliases, {
    idCol: "MUN_ID",
    nameCol: "MUN_NAME",
    levelLabel: "Municipality",
    prefixRegex: /^(municipio|mun)\.?\s+/i,
    codeRegex: /^\d{4}$/,
    parentFilterIds: parentIds,
    parentPrefixLen: parentIds ? 2 : null,
    parentHint: "Use province to disambiguate",
    tolerance,
    onError
  });
}

export async function cleanDmName(names, { municipality = null, tolerance = 0.25, onError = "fail" } = {}) {
  const aliases = await dmAliases();
  const parentIds = municipality ? await resolveParentIds(municipality, await municipalityAliases(), "MUN_ID", "MUN_NAME") : null;
  return genericCleanNames(names, aliases, {
    idCol: "DM_ID",
    nameCol: "DM_NAME",
    levelLabel: "DM",
    prefixRegex: /^(distrito\s+municipal|dist\.?\s*mun\.?|d\.?\s*m\.?)\s+/i,
    codeRegex: /^\d{6}$/,
    parentFilterIds: parentIds,
    parentPrefixLen: parentIds ? 4 : null,
    parentHint: "Use municipality to disambiguate",
    tolerance,
    onError
  });
}

export async function cleanSectionName(names, { dm: dmName = null, municipality = null, tolerance = 0.25, onError = "fail" } = {}) {
  const aliases = await sectionAliases();
  let parentIds = null;
  let parentPrefixLen = null;
  if (dmName) {
    parentIds = await resolveParentIds(dmName, await dmAliases(), "DM_ID", "DM_NAME");
    parentPrefixLen = parentIds ? 6 : null;
  } else if (municipality) {
    parentIds = await resolveParentIds(municipality, await municipalityAliases(), "MUN_ID", "MUN_NAME");
    parentPrefixLen = parentIds ? 4 : null;
  }
  return genericCleanNames(names, aliases, {
    idCol: "SEC_ID",
    nameCol: "SEC_NAME",
    levelLabel: "Section",
    prefixRegex: /^(seccion|secc?\.?)\s+/i,
    codeRegex: /^\d{8}$/,
    parentFilterIds: parentIds,
    parentPrefixLen,
    parentHint: "Use dm or municipality to disambiguate",
    tolerance,
    onError
  });
}

export async function cleanBparajeName(names, { section = null, dm: dmName = null, municipality = null, tolerance = 0.25, onError = "fail" } = {}) {
  const aliases = await bparajeAliases();
  let parentIds = null;
  let parentPrefixLen = null;
  if (section) {
    parentIds = await resolveParentIds(section, await sectionAliases(), "SEC_ID", "SEC_NAME");
    parentPrefixLen = parentIds ? 8 : null;
  } else if (dmName) {
    parentIds = await resolveParentIds(dmName, await dmAliases(), "DM_ID", "DM_NAME");
    parentPrefixLen = parentIds ? 6 : null;
  } else if (municipality) {
    parentIds = await resolveParentIds(municipality, await municipalityAliases(), "MUN_ID", "MUN_NAME");
    parentPrefixLen = parentIds ? 4 : null;
  }
  return genericCleanNames(names, aliases, {
    idCol: "BP_ID",
    nameCol: "BP_NAME",
    levelLabel: "Barrio/paraje",
    prefixRegex: /^(barrio|paraje|bar\.?)\s+/i,
    codeRegex: /^\d{11}$/,
    parentFilterIds: parentIds,
    parentPrefixLen,
    parentHint: "Use section, dm, or municipality to disambiguate",
    tolerance,
    onError
  });
}

export async function cleanZoneName(names, { tolerance = 0.25, onError = "fail" } = {}) {
  return genericCleanNames(names, await zoneAliases(), {
    idCol: "ZONE_ID",
    nameCol: "ZONE_NAME",
    levelLabel: "Zone",
    prefixRegex: /^(zona|area)\s+/i,
    codeRegex: /^\d{2}$/,
    tolerance,
    onError
  });
}

async function adminLevelsData() {
  const entries = await Promise.allSettled([
    provinces({ sf: false }).then((data) => ["provinces", data]),
    regions({ sf: false }).then((data) => ["regions", data]),
    municipalities({ sf: false }).then((data) => ["municipalities", data]),
    dm({ sf: false }).then((data) => ["dm", data]),
    sections({ sf: false }).then((data) => ["sections", data]),
    Promise.resolve(["zones", zones()]),
    bparajes({ sf: false }).then((data) => ["bparajes", data])
  ]);
  return Object.fromEntries(entries.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value));
}

export async function detectLevel(data, { level = null, name = null, key = null } = {}) {
  if (level && name && key) return { level, name, key, matchCount: null, totalCount: null };
  let refs = await adminLevelsData();
  if (level) refs = Object.fromEntries(Object.entries(refs).filter(([levelName]) => levelName === level));

  let best = { level: null, name: null, key: null, matchCount: 0, totalCount: 0 };
  const dataRows = rows(data);
  const dataCols = dataRows.length ? Object.keys(dataRows[0]) : [];
  const candidateDataCols = name ? dataCols.filter((column) => column === name) : dataCols;

  for (const [levelName, refRows] of Object.entries(refs)) {
    const refCols = refRows.length ? Object.keys(refRows[0]) : [];
    const keyCandidates = key
      ? [key]
      : [...new Set(LEVEL_KEY_CANDIDATES[levelName] || refCols)];
    for (const refCol of keyCandidates) {
      if (["fid", "objectid", "objectid_1", "id", "geometry"].includes(refCol.toLowerCase())) continue;
      const refValues = new Set(
        refRows
          .map((row) => joinValueForKey(row, refCol))
          .filter((value) => !isMissing(value) && String(value).trim() !== "")
          .map(normalizedJoinKey)
      );
      if (!refValues.size) continue;
      for (const dataCol of candidateDataCols) {
        const unique = [
          ...new Set(
            dataRows
              .map((row) => joinValueForKey(row, dataCol))
              .filter((value) => !isMissing(value) && String(value).trim() !== "")
              .map(normalizedJoinKey)
          )
        ];
        if (!unique.length) continue;
        const matches = unique.filter((value) => refValues.has(value)).length;
        const total = unique.length;
        const ratio = matches / total;
        const candidate = { level: levelName, name: dataCol, key: refCol, matchCount: matches, totalCount: total };
        if (isBetterDetection(candidate, best, ratio)) best = candidate;
      }
    }
  }
  return best;
}

function isBetterDetection(candidate, best, candidateRatio = null) {
  if (candidate.matchCount === 0) return false;
  const ratio = candidateRatio ?? candidate.matchCount / candidate.totalCount;
  const bestRatio = best.totalCount > 0 ? best.matchCount / best.totalCount : 0;
  const candidateRank = LEVEL_DETAIL_RANK[candidate.level] ?? 0;
  const bestRank = LEVEL_DETAIL_RANK[best.level] ?? 0;

  if (
    ratio >= 0.8 &&
    bestRatio >= 0.8 &&
    candidateRank > bestRank &&
    candidate.matchCount >= best.matchCount * 1.5
  ) {
    return true;
  }

  if (ratio > bestRatio + 1e-9) return true;
  if (Math.abs(ratio - bestRatio) > 1e-9) return false;
  if (candidate.matchCount !== best.matchCount) return candidate.matchCount > best.matchCount;

  const candidateNameKeyMatch = normalizedColumnName(candidate.name) === normalizedColumnName(candidate.key);
  const bestNameKeyMatch = normalizedColumnName(best.name) === normalizedColumnName(best.key);
  if (candidateNameKeyMatch !== bestNameKeyMatch) return candidateNameKeyMatch;

  return candidateRank > bestRank;
}

function normalizedColumnName(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function detectFill(data, { exclude = [] } = {}) {
  const dataRows = rows(data);
  const columns = dataRows.length ? Object.keys(dataRows[0]).filter((column) => !exclude.includes(column)) : [];
  if (!columns.length) throw new Error("No hay variables candidatas para fill");

  const scores = new Map();
  for (const column of columns) {
    const values = dataRows.map((row) => row[column]);
    const present = values.filter((value) => !isMissing(value));
    const naRatio = values.length ? 1 - present.length / values.length : 1;
    if (naRatio > 0.2 || !present.length || new Set(present.map(String)).size === 1) {
      scores.set(column, 0);
      continue;
    }

    const numeric = present.every((value) => typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))));
    if (numeric) {
      const nums = present.map(Number);
      const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
      const variance = nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(nums.length - 1, 1);
      const std = Math.sqrt(variance);
      const maxAbs = Math.max(...nums.map(Math.abs));
      const score = mean === 0 ? (maxAbs > 0 ? std / maxAbs : 0) : 1 - Math.exp(-(std / Math.abs(mean)));
      scores.set(column, score * 1.5 * (1 - naRatio));
    } else {
      const counts = new Map();
      for (const value of present) counts.set(String(value), (counts.get(String(value)) || 0) + 1);
      const entropy = [...counts.values()].reduce((sum, count) => {
        const p = count / present.length;
        return sum - p * Math.log2(p + 1e-10);
      }, 0);
      const maxEntropy = Math.log2(counts.size);
      scores.set(column, (maxEntropy > 0 ? entropy / maxEntropy : 0) * (1 - naRatio));
    }
  }

  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) throw new Error("No se pudo detectar una variable apropiada para fill");
  return best[0];
}

export async function detectColumnType(column, columnName = "columna") {
  return detectLevel(Array.from(column).map((value) => ({ [columnName]: value })));
}

export async function analyzeColumns(data, { threshold = 0.7 } = {}) {
  const dataRows = rows(data);
  const columns = dataRows.length ? Object.keys(dataRows[0]) : [];
  const results = [];
  for (const column of columns) {
    if (!dataRows.some((row) => typeof row[column] === "string")) continue;
    const result = await detectColumnType(dataRows.map((row) => row[column]), column);
    const matchCount = result.matchCount || 0;
    const totalCount = result.totalCount || 0;
    const matchRatio = totalCount > 0 ? matchCount / totalCount : 0;
    results.push({
      columnName: column,
      detectedLevel: result.level,
      keyVariable: result.key,
      matchCount,
      totalCount,
      matchRatio,
      isGeographic: result.level !== null && matchRatio >= threshold
    });
  }
  return results;
}

async function cleanForLevel(level, values, options = {}) {
  const cleaners = {
    provinces: cleanProvName,
    regions: cleanRegionName,
    municipalities: cleanMunicipalityName,
    dm: cleanDmName,
    sections: cleanSectionName,
    zones: cleanZoneName,
    bparajes: cleanBparajeName
  };
  const cleaner = cleaners[level];
  return cleaner ? cleaner(values, options) : values;
}

function normalizedJoinKey(value) {
  if (isMissing(value)) return "";
  return String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().trim().replace(/\s+/g, " ");
}

async function geoForLevel(level) {
  const fns = { provinces, regions, municipalities, dm, sections, zones, bparajes };
  const fn = fns[level];
  if (!fn) throw new Error(`Nivel administrativo no reconocido: ${level}`);
  return fn();
}

function mergeIntoGeoData(geoDataValue, geoKeys, byKey, fill, dataColumns) {
  const attach = (properties) => {
    const joined = byKey.get(normalizedJoinKey(geoKeys.shift()));
    if (!joined) return properties;
    const next = { ...properties };
    for (const column of dataColumns) {
      const outputColumn = column in next ? `${column}_data` : column;
      next[outputColumn] = joined[column];
    }
    return next;
  };

  if (Array.isArray(geoDataValue)) return geoDataValue.map((row) => attach({ ...row }));
  if (geoDataValue.type === "FeatureCollection") {
    return {
      ...geoDataValue,
      features: geoDataValue.features.map((feature) => ({
        ...feature,
        properties: attach({ ...(feature.properties || {}) })
      })),
      properties: { ...(geoDataValue.properties || {}), fillVar: fill }
    };
  }
  if (geoDataValue.type === "Topology") {
    const objects = {};
    for (const [name, object] of Object.entries(geoDataValue.objects || {})) {
      objects[name] = {
        ...object,
        geometries: (object.geometries || []).map((geometry) => ({
          ...geometry,
          properties: attach({ ...(geometry.properties || {}) })
        }))
      };
    }
    return { ...geoDataValue, objects, properties: { ...(geoDataValue.properties || {}), fillVar: fill } };
  }
  return geoDataValue;
}

export async function mapData(data, { fill = null, level = null, name = null, key = null } = {}) {
  const info = await detectLevel(data, { level, name, key });
  if (!info.level) throw new Error("No se pudo determinar el nivel administrativo. Especifique level, name y key manualmente.");
  if (!info.name) throw new Error("No se pudo determinar la variable geografica en data.");
  if (!info.key) throw new Error("No se pudo determinar la variable clave de enlace.");

  const dataRows = rows(data);
  const fillVar = fill || detectFill(dataRows, { exclude: [info.name] });
  const geo = await geoForLevel(info.level);
  const geoRows = rows(geo);
  const dataNames = info.key === "TOPONIMIA"
    ? await cleanForLevel(info.level, dataRows.map((row) => row[info.name]), { tolerance: 0.5, onError: "na" })
    : dataRows.map((row) => joinValueForKey(row, info.name));
  const geoNames = info.key === "TOPONIMIA"
    ? await cleanForLevel(info.level, geoRows.map((row) => row[info.key]), { tolerance: 0.5, onError: "omit" })
    : geoRows.map((row) => joinValueForKey(row, info.key));
  const dataByKey = new Map(dataRows.map((row, index) => [normalizedJoinKey(dataNames[index]), row]));
  const merged = mergeIntoGeoData(geo, [...geoNames], dataByKey, fillVar, Object.keys(dataRows[0] || {}));
  return { data: merged, fillVar, geoLevel: info.level, join: info };
}

export async function addParentCols(data, { levels = null, level = null, name = null, key = null, clean = true, tolerance = 0.25, onError = "na" } = {}) {
  const info = await detectLevel(data, { level, name, key });
  if (!info.level) throw new Error("No se pudo detectar el nivel administrativo de los datos. Especifique level, name y key manualmente.");
  const currentIndex = LEVELS.indexOf(info.level);
  if (currentIndex < 0) throw new Error(`Nivel '${info.level}' no es parte de la jerarquia estandar.`);
  if (currentIndex === 0) return rows(data).map((row) => ({ ...row }));

  const wanted = levels === null ? LEVELS.slice(0, currentIndex) : (Array.isArray(levels) ? levels : [levels]).filter((item) => LEVELS.slice(0, currentIndex).includes(item));
  if (!wanted.length) return rows(data).map((row) => ({ ...row }));

  const currentRows = await geoForLevel(info.level).then(rows);
  const currentNames = await cleanForLevel(info.level, currentRows.map((row) => row.TOPONIMIA), { onError: "na" });
  const lookup = new Map(currentRows.map((row, index) => [currentNames[index], row]));
  const result = rows(data).map((row) => ({ ...row }));
  const currentValues = clean ? await cleanForLevel(info.level, result.map((row) => row[info.name]), { tolerance, onError }) : result.map((row) => row[info.name]);
  const parentMaps = {};

  if (wanted.includes("regions")) {
    const regRows = rows(await regions({ sf: false }));
    const regNames = await cleanRegionName(regRows.map((row) => row.TOPONIMIA), { onError: "na" });
    parentMaps.regions = new Map(regRows.map((row, index) => [codeValue(row.CODREG ?? row.REG, "CODREG"), regNames[index]]));
  }

  if (wanted.includes("provinces")) {
    const provRows = rows(await provinces({ sf: false }));
    const provNames = await cleanProvName(provRows.map((row) => row.TOPONIMIA), { onError: "na" });
    parentMaps.provinces = new Map(provRows.map((row, index) => [codeValue(row.PROV, "PROV"), provNames[index]]));
  }

  if (wanted.includes("municipalities")) {
    const munRows = rows(await municipalities({ sf: false }));
    const munNames = await cleanMunicipalityName(munRows.map((row) => row.TOPONIMIA), { onError: "na" });
    parentMaps.municipalities = new Map(munRows.map((row, index) => [composeId(row, ["PROV", "MUN"]), munNames[index]]));
  }

  if (wanted.includes("dm")) {
    const dmRows = rows(await dm({ sf: false }));
    const dmNames = await cleanDmName(dmRows.map((row) => row.TOPONIMIA), { onError: "na" });
    parentMaps.dm = new Map(dmRows.map((row, index) => [composeId(row, ["PROV", "MUN", "DM"]), dmNames[index]]));
  }

  if (wanted.includes("sections")) {
    const secRows = rows(await sections({ sf: false }));
    const secNames = await cleanSectionName(secRows.map((row) => row.TOPONIMIA), { onError: "na" });
    parentMaps.sections = new Map(secRows.map((row, index) => {
      const secCol = "SEC" in row ? "SEC" : "SECC";
      return [composeId(row, ["PROV", "MUN", "DM", secCol]), secNames[index]];
    }));
  }

  for (let i = 0; i < result.length; i += 1) {
    const ref = lookup.get(currentValues[i]);
    if (!ref) continue;
    for (const parent of wanted) {
      if (parent === "regions" && "REG" in ref) result[i][LEVEL_COL_NAMES[parent]] = parentMaps.regions?.get(codeValue(ref.REG, "REG")) ?? null;
      if (parent === "provinces" && "PROV" in ref) result[i][LEVEL_COL_NAMES[parent]] = parentMaps.provinces?.get(codeValue(ref.PROV, "PROV")) ?? null;
      if (parent === "municipalities" && "MUN" in ref) result[i][LEVEL_COL_NAMES[parent]] = parentMaps.municipalities?.get(composeId(ref, ["PROV", "MUN"])) ?? null;
      if (parent === "dm" && "DM" in ref) result[i][LEVEL_COL_NAMES[parent]] = parentMaps.dm?.get(composeId(ref, ["PROV", "MUN", "DM"])) ?? null;
      const secCol = "SEC" in ref ? "SEC" : ("SECC" in ref ? "SECC" : null);
      if (parent === "sections" && secCol) result[i][LEVEL_COL_NAMES[parent]] = parentMaps.sections?.get(composeId(ref, ["PROV", "MUN", "DM", secCol])) ?? null;
    }
  }
  return result;
}

export async function mapSvg(data, options = {}) {
  const {
    fill = null,
    level = null,
    name = null,
    key = null,
    width = 1440,
    height = 1440,
    padding = 82,
    title = null,
    subtitle = null,
    caption = null,
    labels = false,
    labelSize = 20,
    labelColor = "#202020",
    labelHalo = "#ffffff",
    legend = true,
    background = "#ffffff",
    stroke = "#ffffff",
    strokeWidth = 1.15,
    missing = "#d6d6d6"
  } = options;

  const joined = await mapData(data, { fill, level, name, key });
  const features = topologyToFeatures(joined.data);
  const rawValues = features
    .map((feature) => feature.properties[joined.fillVar])
    .filter((value) => !isMissing(value) && String(value).trim() !== "");
  const numericFill = rawValues.length > 0 && rawValues.every((value) => Number.isFinite(Number(value)));
  const values = numericFill ? rawValues.map(Number) : [];
  const categories = numericFill ? [] : [...new Set(rawValues.map((value) => String(value)))];
  const categoryColors = new Map(categories.map((category, index) => [category, categoricalColor(index)]));
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const bounds = featureBounds(features);
  const scale = Math.min(
    (width - padding * 2) / (bounds.maxX - bounds.minX),
    (height - padding * 2) / (bounds.maxY - bounds.minY)
  );
  const drawnWidth = (bounds.maxX - bounds.minX) * scale;
  const drawnHeight = (bounds.maxY - bounds.minY) * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2 - (title || subtitle ? 14 : 0);

  const project = ([x, y]) => [
    offsetX + (x - bounds.minX) * scale,
    offsetY + (bounds.maxY - y) * scale
  ];

  const paths = features.map((feature) => {
    const rawValue = feature.properties[joined.fillVar];
    const value = Number(rawValue);
    const color = fillColor(rawValue, { numericFill, min, max, categoryColors, missing });
    const label = feature.properties.TOPONIMIA ?? feature.properties.NAME ?? "";
    const titleText = `${label}${!isMissing(rawValue) && String(rawValue).trim() !== "" ? `: ${rawValue}` : ""}`;
    return `<path d="${featurePath(feature, project)}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"><title>${escapeXml(titleText)}</title></path>`;
  }).join("\n");

  const labelBlock = labels ? features.map((feature) => {
    const point = featureLabelPoint(feature, project);
    if (!point) return "";
    const value = Number(feature.properties[joined.fillVar]);
    const nameText = feature.properties.TOPONIMIA ?? feature.properties.NAME ?? "";
    const valueText = Number.isFinite(value) ? formatLabelValue(value) : "";
    const text = labelText(labels, nameText, valueText);
    if (!text) return "";
    return `<text x="${point[0].toFixed(2)}" y="${point[1].toFixed(2)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${labelSize}" font-weight="650" fill="${labelColor}" stroke="${labelHalo}" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${escapeXml(text)}</text>`;
  }).filter(Boolean).join("\n") : "";

  const titleBlock = [
    title ? `<text x="${padding}" y="86" font-family="Arial, Helvetica, sans-serif" font-size="35" font-weight="700" fill="#1b1b1b">${escapeXml(title)}</text>` : "",
    subtitle ? `<text x="${padding}" y="124" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="#555555">${escapeXml(subtitle)}</text>` : ""
  ].filter(Boolean).join("\n");

  const captionBlock = caption
    ? `<text x="${padding}" y="${height - 30}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#666666">${escapeXml(caption)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <rect width="100%" height="100%" fill="${background}"/>
  <g>${paths}</g>
  <g>${labelBlock}</g>
  ${titleBlock}
  ${legend ? svgLegend({ numericFill, min, max, label: joined.fillVar, categories, categoryColors, width, height }) : ""}
  ${captionBlock}
</svg>
`;
}

export const gdMap = mapSvg;

function topologyToFeatures(topology) {
  if (Array.isArray(topology)) {
    return topology.map((row) => ({ properties: row, coordinates: [] }));
  }
  if (topology.type === "FeatureCollection") {
    return topology.features.map((feature) => ({
      properties: feature.properties || {},
      coordinates: feature.geometry?.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry?.coordinates || []
    }));
  }
  if (topology.type !== "Topology") {
    throw new Error("mapSvg requiere datos geograficos GeoJSON o TopoJSON.");
  }

  const arcs = decodeTopoArcs(topology);
  const object = Object.values(topology.objects || {})[0];
  return (object.geometries || []).map((geometry) => ({
    properties: geometry.properties || {},
    coordinates: geometryCoordinates(arcs, geometry)
  }));
}

function decodeTopoArcs(topology) {
  const { scale = [1, 1], translate = [0, 0] } = topology.transform || {};
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function topoArc(arcs, index) {
  return index >= 0 ? arcs[index] : [...arcs[~index]].reverse();
}

function topoRing(arcs, indexes) {
  const points = [];
  for (const index of indexes) {
    const arc = topoArc(arcs, index);
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
}

function geometryCoordinates(arcs, geometry) {
  if (geometry.type === "Polygon") {
    return [geometry.arcs.map((ring) => topoRing(arcs, ring))];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.arcs.map((polygon) => polygon.map((ring) => topoRing(arcs, ring)));
  }
  return [];
}

function featurePath(feature, project) {
  return feature.coordinates
    .flatMap((polygon) => polygon.map((ring) => ringPath(ring, project)))
    .join(" ");
}

function ringPath(ring, project) {
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

function featureLabelPoint(feature, project) {
  const rings = feature.coordinates.flatMap((polygon) => polygon);
  if (!rings.length) return null;
  const ring = rings.reduce((best, current) => Math.abs(ringArea(current)) > Math.abs(ringArea(best)) ? current : best, rings[0]);
  const centroid = ringCentroid(ring);
  return project(centroid);
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ringCentroid(ring) {
  const area = ringArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-12) {
    const sums = ring.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return [sums[0] / ring.length, sums[1] / ring.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const factor = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * factor;
    cy += (y1 + y2) * factor;
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function labelText(mode, name, value) {
  if (mode === true || mode === "name") return name;
  if (mode === "value") return value;
  if (mode === "both") return [name, value].filter(Boolean).join(": ");
  return "";
}

function formatLabelValue(value) {
  return Number.isInteger(value) ? String(value) : Number(value.toPrecision(4)).toLocaleString("en-US");
}

function featureBounds(features) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const feature of features) {
    for (const polygon of feature.coordinates) {
      for (const ring of polygon) {
        for (const [x, y] of ring) {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        }
      }
    }
  }
  return bounds;
}

function viridisColor(t) {
  const stops = [
    [0.0, "#440154"],
    [0.13, "#482878"],
    [0.25, "#3e4989"],
    [0.38, "#31688e"],
    [0.5, "#26828e"],
    [0.63, "#1f9e89"],
    [0.75, "#35b779"],
    [0.88, "#6ece58"],
    [1.0, "#fde725"]
  ];
  const clamped = Math.max(0, Math.min(1, t));
  const upperIndex = stops.findIndex(([stop]) => stop >= clamped);
  if (upperIndex <= 0) return stops[0][1];
  const [t1, c1] = stops[upperIndex - 1];
  const [t2, c2] = stops[upperIndex];
  return mixHex(c1, c2, (clamped - t1) / (t2 - t1));
}

function categoricalColor(index) {
  if (index < CATEGORICAL_COLORS.length) return CATEGORICAL_COLORS[index];
  return viridisColor((index % 13) / 12);
}

function fillColor(value, { numericFill, min, max, categoryColors, missing }) {
  if (isMissing(value) || String(value).trim() === "") return missing;
  if (numericFill) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return missing;
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      return viridisColor((numeric - min) / (max - min));
    }
    return viridisColor(0.5);
  }
  return categoryColors.get(String(value)) || missing;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const rgb = ca.map((value, index) => Math.round(value + (cb[index] - value) * t));
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function svgLegend({ numericFill, min, max, label, categories, categoryColors, width, height }) {
  if (numericFill && Number.isFinite(min) && Number.isFinite(max)) {
    return svgNumericLegend(min, max, label, width, height);
  }
  if (categories.length) return svgCategoricalLegend(categories, categoryColors, label, width, height);
  return "";
}

function svgNumericLegend(min, max, label, width, height) {
  const x = width - 384;
  const y = height - 164;
  const w = 250;
  const h = 18;
  const bands = Array.from({ length: 50 }, (_, index) => {
    const t = index / 49;
    return `<rect x="${x + t * w}" y="${y}" width="${w / 49 + 1}" height="${h}" fill="${viridisColor(t)}"/>`;
  }).join("");

  return `<g font-family="Arial, Helvetica, sans-serif">
    <text x="${x}" y="${y - 14}" font-size="18" font-weight="700" fill="#333333">${escapeXml(label)}</text>
    ${bands}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#777777" stroke-width="0.8"/>
    <text x="${x}" y="${y + 47}" font-size="16" fill="#555555">${formatNumber(min)}</text>
    <text x="${x + w}" y="${y + 47}" text-anchor="end" font-size="16" fill="#555555">${formatNumber(max)}</text>
  </g>`;
}

function svgCategoricalLegend(categories, colorMap, label, width, height) {
  const maxItems = 12;
  const shown = categories.slice(0, maxItems);
  const hidden = categories.length - shown.length;
  const rowHeight = 24;
  const x = width - 330;
  const y = Math.max(96, height - 76 - rowHeight * (shown.length + (hidden > 0 ? 1 : 0)));
  const rows = shown.map((category, index) => {
    const rowY = y + 28 + index * rowHeight;
    return `<g>
      <rect x="${x}" y="${rowY - 13}" width="16" height="16" rx="2" fill="${colorMap.get(category)}"/>
      <text x="${x + 24}" y="${rowY}" font-size="16" fill="#555555">${escapeXml(truncateLegendLabel(category))}</text>
    </g>`;
  }).join("");
  const more = hidden > 0
    ? `<text x="${x}" y="${y + 28 + shown.length * rowHeight}" font-size="15" fill="#666666">+${hidden} categorias mas</text>`
    : "";
  return `<g font-family="Arial, Helvetica, sans-serif">
    <text x="${x}" y="${y}" font-size="18" font-weight="700" fill="#333333">${escapeXml(label)}</text>
    ${rows}
    ${more}
  </g>`;
}

function truncateLegendLabel(value) {
  const text = String(value);
  return text.length > 24 ? `${text.slice(0, 21)}...` : text;
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value.toPrecision(3)).toString() : "NA";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const gdGetDataset = getDataset;
export const gdProvinces = provinces;
export const gdRegions = regions;
export const gdMunicipalities = municipalities;
export const gdDm = dm;
export const gdSections = sections;
export const gdZones = zones;
export const gdBparajes = bparajes;
export const gdMacroregions = macroregions;
export const gdDetectLevel = detectLevel;
export const gdDetectFill = detectFill;
export const gdDetectColumnType = detectColumnType;
export const gdAnalyzeColumns = analyzeColumns;
export const gdMapData = mapData;
export const gdCleanProvName = cleanProvName;
export const gdCleanRegionName = cleanRegionName;
export const gdCleanMunicipalityName = cleanMunicipalityName;
export const gdCleanDmName = cleanDmName;
export const gdCleanSectionName = cleanSectionName;
export const gdCleanBparajeName = cleanBparajeName;
export const gdCleanZoneName = cleanZoneName;
export const gdAddParentCols = addParentCols;

export { BASE_DATA_URL, CACHE_DIR_NAME };
