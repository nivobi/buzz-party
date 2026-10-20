import { BUTTONS, keyFor, SLOTS, type Button, type KeyName, type Slot } from '../shared/keymap.js';
import type { KeyBridge } from './types.js';

interface Held {
  downAt: number;
  pendingUp: ReturnType<typeof setTimeout> | null;
}

/**
 * Turns player button presses into held keys. A very short tap is held for
 * at least `minHoldMs` so the emulator sees it on some frame.
 */
export class Presser {
  private held = new Map<KeyName, Held>();

  constructor(private bridge: KeyBridge, private opts: { minHoldMs: number }) {}

  press(slot: Slot, b: Button): void {
    const key = keyFor(slot, b);
    const h = this.held.get(key);
    if (h) {
      if (h.pendingUp) clearTimeout(h.pendingUp);
      h.pendingUp = null;
      return;
    }
    this.held.set(key, { downAt: Date.now(), pendingUp: null });
    this.bridge.keyDown(key);
  }

  release(slot: Slot, b: Button): void {
    const key = keyFor(slot, b);
    const h = this.held.get(key);
    if (!h || h.pendingUp) return;
    const wait = this.opts.minHoldMs - (Date.now() - h.downAt);
    if (wait <= 0) this.up(key);
    else h.pendingUp = setTimeout(() => this.up(key), wait);
  }

  /** Releases immediately: one player's keys, or everyone's. */
  releaseAll(slot?: Slot): void {
    for (const s of slot === undefined ? SLOTS : [slot]) {
      for (const b of BUTTONS) {
        const key = keyFor(s, b);
        if (this.held.has(key)) this.up(key);
      }
    }
  }

  private up(key: KeyName): void {
    const h = this.held.get(key);
    if (!h) return;
    if (h.pendingUp) clearTimeout(h.pendingUp);
    this.held.delete(key);
    this.bridge.keyUp(key);
  }
}
