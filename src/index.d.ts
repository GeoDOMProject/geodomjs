export type Row = Record<string, unknown>;
export type CleanErrorMode = "fail" | "na" | "omit";

export interface DataOptions {
  id?: string;
  sf?: boolean;
  verbose?: boolean;
  forceDownload?: boolean;
}

export interface CleanOptions {
  tolerance?: number;
  onError?: CleanErrorMode;
}

export interface DetectResult {
  level: string | null;
  name: string | null;
  key: string | null;
  matchCount: number | null;
  totalCount: number | null;
}

export const BASE_DATA_URL: string;
export const CACHE_DIR_NAME: string;

export function fetchAndCache(id: string, options?: DataOptions & { dataType?: string }): Promise<unknown>;
export function getDataset(id: string, options?: DataOptions): Promise<unknown>;
export function provinces(options?: DataOptions & { reg?: string | null }): Promise<unknown>;
export function regions(options?: DataOptions): Promise<unknown>;
export function municipalities(options?: DataOptions): Promise<unknown>;
export function dm(options?: DataOptions): Promise<unknown>;
export function sections(options?: DataOptions): Promise<unknown>;
export function bparajes(options?: DataOptions): Promise<unknown>;
export function macroregions(options?: DataOptions): Promise<unknown>;
export function zones(): Row[];

export function normalizeName(name: unknown): string;
export function cleanProvName(names: string | unknown[], options?: CleanOptions): Promise<string | Array<string | null>>;
export function cleanRegionName(names: string | unknown[], options?: CleanOptions): Promise<string | Array<string | null>>;
export function cleanMunicipalityName(names: string | unknown[], options?: CleanOptions & { province?: string | null }): Promise<string | Array<string | null>>;
export function cleanDmName(names: string | unknown[], options?: CleanOptions & { municipality?: string | null }): Promise<string | Array<string | null>>;
export function cleanSectionName(names: string | unknown[], options?: CleanOptions & { dm?: string | null; municipality?: string | null }): Promise<string | Array<string | null>>;
export function cleanBparajeName(names: string | unknown[], options?: CleanOptions & { section?: string | null; dm?: string | null; municipality?: string | null }): Promise<string | Array<string | null>>;
export function cleanZoneName(names: string | unknown[], options?: CleanOptions): Promise<string | Array<string | null>>;

export function detectLevel(data: Row[] | unknown, options?: { level?: string | null; name?: string | null; key?: string | null }): Promise<DetectResult>;
export function detectFill(data: Row[] | unknown, options?: { exclude?: string[] }): string;
export function detectColumnType(column: Iterable<unknown>, columnName?: string): Promise<DetectResult>;
export function analyzeColumns(data: Row[] | unknown, options?: { threshold?: number }): Promise<Row[]>;
export function mapData(data: Row[] | unknown, options?: { fill?: string | null; level?: string | null; name?: string | null; key?: string | null }): Promise<{ data: unknown; fillVar: string; geoLevel: string; join: DetectResult }>;
export function mapSvg(data: Row[] | unknown, options?: { fill?: string | null; level?: string | null; name?: string | null; key?: string | null; width?: number; height?: number; padding?: number; title?: string | null; subtitle?: string | null; caption?: string | null; labels?: boolean | "name" | "value" | "both"; labelSize?: number; labelColor?: string; labelHalo?: string; legend?: boolean; colors?: Record<string, string> | Map<string, string> | null; domain?: Iterable<string> | null; background?: string; stroke?: string; strokeWidth?: number; missing?: string }): Promise<string>;
export function addParentCols(data: Row[] | unknown, options?: { levels?: string | string[] | null; level?: string | null; name?: string | null; key?: string | null; clean?: boolean; tolerance?: number; onError?: CleanErrorMode }): Promise<Row[]>;
export const gdMap: typeof mapSvg;

export const gdGetDataset: typeof getDataset;
export const gdProvinces: typeof provinces;
export const gdRegions: typeof regions;
export const gdMunicipalities: typeof municipalities;
export const gdDm: typeof dm;
export const gdSections: typeof sections;
export const gdZones: typeof zones;
export const gdBparajes: typeof bparajes;
export const gdMacroregions: typeof macroregions;
export const gdDetectLevel: typeof detectLevel;
export const gdDetectFill: typeof detectFill;
export const gdDetectColumnType: typeof detectColumnType;
export const gdAnalyzeColumns: typeof analyzeColumns;
export const gdMapData: typeof mapData;
export const gdCleanProvName: typeof cleanProvName;
export const gdCleanRegionName: typeof cleanRegionName;
export const gdCleanMunicipalityName: typeof cleanMunicipalityName;
export const gdCleanDmName: typeof cleanDmName;
export const gdCleanSectionName: typeof cleanSectionName;
export const gdCleanBparajeName: typeof cleanBparajeName;
export const gdCleanZoneName: typeof cleanZoneName;
export const gdAddParentCols: typeof addParentCols;
