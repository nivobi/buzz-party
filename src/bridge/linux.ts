import { execFile } from 'node:child_process';
import { LINUX_KEYCODES, type KeyName } from '../shared/keymap.js';
import { HelperProcess } from './helper.js';
import type { KeyBridge, Rect } from './types.js';

export type RunResult = { ok: boolean; out: string };
/** Runs a command and never throws. Replaceable in tests. */
export type Run = (cmd: string, args: string[]) => Promise<RunResult>;

const exec: Run = (cmd, args) =>
  new Promise(resolve => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => resolve({ ok: !err, out: String(stdout ?? '') }));
  });

/**
 * KeyBridge for Linux. Key presses go through the native `buzzhelper`, which
 * makes a virtual keyboard with /dev/uinput (works on X11 and Wayland). Window
 * focus and placement use `xdotool`, so they only work on an X11 session.
 */
export class LinuxBridge implements KeyBridge {
  private helper: HelperProcess;

  constructor(helperPath: string, private run: Run = exec) {
    this.helper = new HelperProcess(helperPath);
  }

  keyDown(k: KeyName): void {
    void this.helper.send(`down ${LINUX_KEYCODES[k]}`);
  }

  keyUp(k: KeyName): void {
    void this.helper.send(`up ${LINUX_KEYCODES[k]}`);
  }

  focusPid(pid: number): void {
    void this.focus(Math.trunc(pid));
  }

  private async focus(pid: number): Promise<void> {
    // Cheap check first, so a watchdog can call this every second.
    const active = await this.run('xdotool', ['getactivewindow', 'getwindowpid']);
    if (active.ok && active.out.trim() === String(pid)) return;
    await this.run('xdotool', ['search', '--onlyvisible', '--pid', String(pid), 'windowactivate', '%1']);
  }

  async placeWindow(pid: number, r: Rect): Promise<boolean> {
    const n = (v: number) => String(Math.round(v));
    const res = await this.run('xdotool', [
      'search', '--onlyvisible', '--pid', String(Math.trunc(pid)),
      'windowmove', '%1', n(r.x), n(r.y),
      'windowsize', '%1', n(r.width), n(r.height),
    ]);
    return res.ok;
  }

  toggleFullscreen(): void {
    void this.helper.send('fullscreen');
  }

  /** "Trusted" means /dev/uinput can be opened. The helper retries each time, so no restart is needed. */
  async isTrusted(): Promise<boolean> {
    return (await this.helper.send('trust 0')) === 'yes';
  }

  isAlive(): boolean {
    return this.helper.alive;
  }

  dispose(): void {
    this.helper.dispose();
  }
}
