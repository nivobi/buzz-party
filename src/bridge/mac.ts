import { MAC_KEYCODES, type KeyName } from '../shared/keymap.js';
import { HelperProcess } from './helper.js';
import type { KeyBridge, Rect } from './types.js';

/**
 * KeyBridge backed by the Swift `buzzhelper` (one reply line per command).
 *
 * Two helper processes: one only for key presses, one for window work. Bringing
 * a window to the front goes through AppleScript and can take a moment; on a
 * shared queue that would hold back buzzer presses behind it.
 */
export class MacBridge implements KeyBridge {
  private keys: HelperProcess;
  private windows: HelperProcess;

  constructor(helperPath: string) {
    this.keys = new HelperProcess(helperPath);
    this.windows = new HelperProcess(helperPath);
  }

  keyDown(k: KeyName): void {
    void this.keys.send(`down ${MAC_KEYCODES[k]}`);
  }

  keyUp(k: KeyName): void {
    void this.keys.send(`up ${MAC_KEYCODES[k]}`);
  }

  focusPid(pid: number): void {
    void this.windows.send(`focus ${pid}`);
  }

  async placeWindow(pid: number, r: Rect): Promise<boolean> {
    return (await this.windows.send(`place ${pid} ${r.x} ${r.y} ${r.width} ${r.height}`)) === 'ok';
  }

  toggleFullscreen(): void {
    void this.windows.send('fullscreen');
  }

  async isTrusted(prompt: boolean): Promise<boolean> {
    const trusted = (await this.windows.send(`trust ${prompt ? 1 : 0}`)) === 'yes';
    // macOS decides Accessibility trust once per process; fresh helpers are
    // the only way to notice the user granting it.
    if (!trusted) {
      this.windows.restart();
      this.keys.restart();
    }
    return trusted;
  }

  isAlive(): boolean {
    return this.keys.alive && this.windows.alive;
  }

  dispose(): void {
    this.keys.dispose();
    this.windows.dispose();
  }
}
