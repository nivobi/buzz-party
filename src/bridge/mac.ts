import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { MAC_KEYCODES, type KeyName } from '../shared/keymap.js';
import type { KeyBridge, Rect } from './types.js';

/** KeyBridge backed by the Swift `buzzhelper` process (one reply line per command). */
export class MacBridge implements KeyBridge {
  private child: ChildProcess | null = null;
  private waiting: ((line: string) => void)[] = [];
  private respawned = false;

  constructor(private helperPath: string) {
    this.start();
  }

  private start(): void {
    const child = spawn(this.helperPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.child = child;
    createInterface({ input: child.stdout! }).on('line', line => this.waiting.shift()?.(line));
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      for (const w of this.waiting.splice(0)) w('fail');
      if (!this.respawned) {
        this.respawned = true;
        this.start();
      }
    });
    child.stdin!.on('error', () => {});
  }

  private send(cmd: string): Promise<string> {
    if (!this.child) return Promise.resolve('fail');
    return new Promise(resolve => {
      this.waiting.push(resolve);
      this.child!.stdin!.write(cmd + '\n');
    });
  }

  keyDown(k: KeyName): void {
    void this.send(`down ${MAC_KEYCODES[k]}`);
  }

  keyUp(k: KeyName): void {
    void this.send(`up ${MAC_KEYCODES[k]}`);
  }

  focusPid(pid: number): void {
    void this.send(`focus ${pid}`);
  }

  async placeWindow(pid: number, r: Rect): Promise<boolean> {
    return (await this.send(`place ${pid} ${r.x} ${r.y} ${r.width} ${r.height}`)) === 'ok';
  }

  toggleFullscreen(): void {
    void this.send('fullscreen');
  }

  async isTrusted(prompt: boolean): Promise<boolean> {
    const trusted = (await this.send(`trust ${prompt ? 1 : 0}`)) === 'yes';
    if (!trusted) {
      // macOS decides Accessibility trust once per process; a fresh helper
      // is the only way to notice the user granting it.
      const old = this.child;
      this.start();
      old?.kill();
    }
    return trusted;
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
  }
}
