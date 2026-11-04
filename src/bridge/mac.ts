import { MAC_KEYCODES, type KeyName } from '../shared/keymap.js';
import { HelperProcess } from './helper.js';
import type { KeyBridge, Rect } from './types.js';

/** KeyBridge backed by the Swift `buzzhelper` process (one reply line per command). */
export class MacBridge implements KeyBridge {
  private helper: HelperProcess;

  constructor(helperPath: string) {
    this.helper = new HelperProcess(helperPath);
  }

  keyDown(k: KeyName): void {
    void this.helper.send(`down ${MAC_KEYCODES[k]}`);
  }

  keyUp(k: KeyName): void {
    void this.helper.send(`up ${MAC_KEYCODES[k]}`);
  }

  focusPid(pid: number): void {
    void this.helper.send(`focus ${pid}`);
  }

  async placeWindow(pid: number, r: Rect): Promise<boolean> {
    return (await this.helper.send(`place ${pid} ${r.x} ${r.y} ${r.width} ${r.height}`)) === 'ok';
  }

  toggleFullscreen(): void {
    void this.helper.send('fullscreen');
  }

  async isTrusted(prompt: boolean): Promise<boolean> {
    const trusted = (await this.helper.send(`trust ${prompt ? 1 : 0}`)) === 'yes';
    // macOS decides Accessibility trust once per process; a fresh helper
    // is the only way to notice the user granting it.
    if (!trusted) this.helper.restart();
    return trusted;
  }

  dispose(): void {
    this.helper.dispose();
  }
}
