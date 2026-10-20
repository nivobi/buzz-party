import { SLOTS, type Slot } from '../shared/keymap.js';

interface Holder {
  token: string;
  disconnectedAt: number | null;
}

/** Which phone (token) holds which player slot, with reconnect grace. */
export class SlotManager {
  private holders = new Map<Slot, Holder>();

  constructor(private opts: { now: () => number; releaseAfterMs: number }) {}

  slotOf(token: string): Slot | null {
    for (const [slot, h] of this.holders) if (h.token === token) return slot;
    return null;
  }

  connect(token: string): Slot | null {
    const slot = this.slotOf(token);
    if (slot !== null) this.holders.get(slot)!.disconnectedAt = null;
    return slot;
  }

  claim(token: string, slot: Slot): boolean {
    const h = this.holders.get(slot);
    if (h && h.token !== token) return false;
    this.release(token);
    this.holders.set(slot, { token, disconnectedAt: null });
    return true;
  }

  release(token: string): void {
    const slot = this.slotOf(token);
    if (slot !== null) this.holders.delete(slot);
  }

  disconnect(token: string): void {
    const slot = this.slotOf(token);
    if (slot !== null) this.holders.get(slot)!.disconnectedAt = this.opts.now();
  }

  /** Frees slots whose phone has been gone too long; returns the freed slots. */
  sweep(): Slot[] {
    const freed: Slot[] = [];
    for (const [slot, h] of this.holders) {
      if (h.disconnectedAt !== null && this.opts.now() - h.disconnectedAt >= this.opts.releaseAfterMs) {
        this.holders.delete(slot);
        freed.push(slot);
      }
    }
    return freed;
  }

  view(): { slot: Slot; taken: boolean; connected: boolean }[] {
    return SLOTS.map(slot => {
      const h = this.holders.get(slot);
      return { slot, taken: !!h, connected: !!h && h.disconnectedAt === null };
    });
  }
}
