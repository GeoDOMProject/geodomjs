import type { InteractivePayload } from './interactive.js';
/** Browser-only renderer for already prepared interactive layers. */
export function mountInteractiveViewer(container: HTMLElement | string, payload: InteractivePayload): { element: HTMLDivElement; destroy(): void };
