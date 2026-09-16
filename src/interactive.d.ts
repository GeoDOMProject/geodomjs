import type { Row } from './index.js';
export interface InteractiveOptions {
  fill?: string | null; level?: string | null; name?: string | null; key?: string | null;
  title?: string; subtitle?: string; caption?: string;
  labels?: boolean | 'name' | 'value' | 'both'; background?: 'none' | 'osm';
  palette?: string | string[] | null; colors?: Record<string, string> | Map<string, string> | null;
  domain?: Iterable<string> | null; missing?: string; backgroundColor?: string;
  stylePreset?: 'standard' | 'editorial'; legendCounts?: boolean; legendUppercase?: boolean;
  context?: boolean; crs?: string;
}
export interface InteractiveLayer { id: string; fillVar: string | null; measured: boolean; geojson: { type: 'FeatureCollection'; features: Array<Record<string, any>> }; }
export interface InteractivePayload { version: string; primary: string; layers: InteractiveLayer[]; options: InteractiveOptions; }
export function toGeoJSON(source: unknown, options?: { crs?: string }): InteractiveLayer['geojson'];
export function interactiveData(data: Row[], options?: InteractiveOptions): Promise<InteractivePayload>;
export function interactiveDocument(payload: InteractivePayload): Promise<string>;
export function mapInteractive(data: Row[], options?: InteractiveOptions): Promise<string>;
export const gdMapInteractive: typeof mapInteractive;
export function mountInteractiveMap(container: HTMLElement | string, data: Row[], options?: InteractiveOptions): Promise<{ element: HTMLDivElement; html: string; destroy(): void }>;
