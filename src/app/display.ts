import type { Rect } from '../bridge/types.js';
import type { Mode } from '../shared/protocol.js';

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

/**
 * Whether to re-check setup, games and the network (for the join QR code).
 * Not during a game: that would rescan discs while PCSX2 reads one.
 */
export function shouldRecheck(mode: Mode): boolean {
  return mode === 'setup' || mode === 'picker' || mode === 'waiting' || mode === 'wifi';
}
