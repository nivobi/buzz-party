import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { KeyBridge, Rect } from '../bridge/types.js';
import type { Game } from './games.js';
import { buildPcsx2Ini } from './pcsx2-config.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** PCSX2 treats `-datapath X` as the parent of its data root `X/PCSX2`. */
export function pcsx2IniPath(dataDir: string): string {
  return join(dataDir, 'PCSX2', 'inis', 'PCSX2.ini');
}

/** Path to the installed PCSX2, or null. */
export function findPcsx2(): string | null {
  if (process.platform === 'darwin') {
    for (const p of ['/Applications/PCSX2.app', join(homedir(), 'Applications/PCSX2.app')]) {
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function pcsx2Pid(): Promise<number | null> {
  try {
    const { stdout } = await promisify(execFile)('pgrep', ['-n', '-f', 'PCSX2.app/Contents/MacOS/PCSX2']);
    const pid = Number(stdout.trim());
    return pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export interface LaunchOptions {
  biosDir: string;
  biosFile: string;
  /** Set when the TV is a separate (extended) display. */
  tvBounds?: Rect;
}

/** Runs one game at a time in PCSX2 with Buzz Party's own data dir. */
export class Pcsx2Manager {
  private child: ChildProcess | null = null;
  private pid: number | null = null;
  private exitListeners: (() => void)[] = [];
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private o: { appPath: string; dataDir: string; template: string; bridge: KeyBridge }) {}

  get running(): boolean {
    return this.child !== null;
  }

  onExit(cb: () => void): void {
    this.exitListeners.push(cb);
  }

  async launch(game: Game, l: LaunchOptions): Promise<void> {
    if (this.child) await this.stop();
    const ini = buildPcsx2Ini(this.o.template, {
      biosDir: l.biosDir,
      biosFile: l.biosFile,
      startFullscreen: !l.tvBounds,
    });
    const iniPath = pcsx2IniPath(this.o.dataDir);
    await mkdir(dirname(iniPath), { recursive: true });
    await writeFile(iniPath, ini);

    // `open -W` stays alive until PCSX2 quits; going through the app bundle
    // keeps macOS Gatekeeper happy.
    const child = spawn('open', ['-n', '-W', '-a', this.o.appPath, '--args',
      '-batch', '-nogui', l.tvBounds ? '-nofullscreen' : '-fullscreen',
      '-datapath', this.o.dataDir, '--', game.path], { stdio: 'ignore' });
    this.child = child;
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      this.pid = null;
      if (this.watchdog) clearInterval(this.watchdog);
      this.watchdog = null;
      for (const cb of this.exitListeners) cb();
    });

    for (let i = 0; i < 50 && this.child === child && this.pid === null; i++) {
      await sleep(200);
      this.pid = await pcsx2Pid();
    }
    if (this.pid === null) throw new Error('PCSX2 did not start');

    if (l.tvBounds) {
      let placed = false;
      for (let i = 0; i < 20 && !placed && this.child === child; i++) {
        placed = await this.o.bridge.placeWindow(this.pid, l.tvBounds);
        if (!placed) await sleep(500);
      }
      this.focus();
      if (placed) {
        await sleep(300);
        this.o.bridge.toggleFullscreen();
      }
    }
    this.focus();
    // Other apps (notifications, launchers) can grab focus mid-game; PCSX2
    // only receives the buzzer keys while it is frontmost.
    this.watchdog = setInterval(() => this.focus(), 1000);
  }

  focus(): void {
    if (this.pid !== null) this.o.bridge.focusPid(this.pid);
  }

  async stop(): Promise<void> {
    const child = this.child;
    const pid = this.pid;
    if (!child) return;
    const exited = new Promise<void>(r => child.once('exit', () => r()));
    if (pid !== null) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    } else {
      child.kill();
    }
    const timedOut = await Promise.race([exited.then(() => false), sleep(5000).then(() => true)]);
    if (timedOut && pid !== null) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      await exited;
    }
  }
}
