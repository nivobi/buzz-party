import type { Rect } from '../bridge/types.js';

export interface DisplayInfo {
  id: number;
  internal: boolean;
  bounds: Rect;
}

/** The TV when the desktop is extended to it, otherwise the only display. */
export function chooseDisplay<D extends DisplayInfo>(displays: D[]): { display: D; external: boolean } {
  if (displays.length > 1) {
    const ext = displays.find(d => !d.internal);
    if (ext) return { display: ext, external: true };
  }
  return { display: displays[0], external: false };
}
