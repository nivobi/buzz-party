import type { KeyName } from '../shared/keymap.js';
import type { KeyBridge, Rect } from './types.js';

/** Records what it was asked to do. For tests and for running without OS access. */
export class FakeBridge implements KeyBridge {
  events: string[] = [];
  trusted = true;

  keyDown(k: KeyName): void { this.events.push(`down:${k}`); }
  keyUp(k: KeyName): void { this.events.push(`up:${k}`); }
  focusPid(pid: number): void { this.events.push(`focus:${pid}`); }
  async placeWindow(pid: number, r: Rect): Promise<boolean> {
    this.events.push(`place:${pid}:${r.x},${r.y},${r.width}x${r.height}`);
    return true;
  }
  toggleFullscreen(): void { this.events.push('fullscreen'); }
  async isTrusted(): Promise<boolean> { return this.trusted; }
  dispose(): void {}
}
