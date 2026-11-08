import { execFile, spawn } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { KeyBridge, Rect } from '../bridge/types.js';
import type { Game } from './games.js';
import { buildPcsx2Ini } from './pcsx2-config.js';


/** PCSX2 treats `-datapath X` as the parent of its data root `X/PCSX2`. */
export function pcsx2IniPath(dataDir: string): string {
  return join(dataDir, 'PCSX2', 'inis', 'PCSX2.ini');
}

/** Path to the installed PCSX2 (our build first), or null. */
export function findPcsx2(): string | null {
  return findPcsx2Candidates()[0] ?? null;
}

/** True for the patched Buzz Party build of PCSX2 (it reports the buzzer lights). */
export function isBuzzPartyBuild(path: string): boolean {
  const name = basename(path);
  return name === 'PCSX2-BuzzParty.app' || /^pcsx2-buzzparty.*\.appimage$/i.test(name);
}

const LINUX_DIRS = (home: string) => ['/opt/pcsx2', join(home, 'Applications'), join(home, 'BuzzParty'), join(home, '.local/bin'), '/usr/local/bin'];

/**
 * Every PCSX2 worth trying, best first: $PCSX2_PATH, then our patched build,
 * then stock PCSX2. On Linux stock means an AppImage in a few usual folders
 * (newest name first), then `pcsx2-qt` or `pcsx2` on the PATH.
 */
export function findPcsx2Candidates(o: {
  platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; home?: string; dirs?: string[]; exists?: (p: string) => boolean;
} = {}): string[] {
  const platform = o.platform ?? process.platform;
  const env = o.env ?? process.env;
  const home = o.home ?? homedir();
  const out: string[] = [];
  const add = (p: string) => { if (!out.includes(p)) out.push(p); };
  if (platform === 'darwin') {
    const exists = o.exists ?? existsSync;
    if (env.PCSX2_PATH && exists(env.PCSX2_PATH)) add(env.PCSX2_PATH);
    for (const name of ['PCSX2-BuzzParty.app', 'PCSX2.app']) {
      for (const dir of ['/Applications', join(home, 'Applications')]) if (exists(join(dir, name))) add(join(dir, name));
    }
    return out;
  }
  if (platform !== 'linux') return out;
  const runnable = (p: string) => {
    try {
      accessSync(p, constants.X_OK);
      return statSync(p).isFile();
    } catch {
      return false;
    }
  };
  if (env.PCSX2_PATH && runnable(env.PCSX2_PATH)) add(env.PCSX2_PATH);
  const images: string[] = [];
  for (const dir of o.dirs ?? LINUX_DIRS(home)) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    images.push(...names.filter(n => /^pcsx2.*\.appimage$/i.test(n)).sort().reverse().map(n => join(dir, n)).filter(runnable));
  }
  for (const p of images) if (isBuzzPartyBuild(p)) add(p);
  for (const p of images) add(p);
  for (const dir of (env.PATH ?? '').split(':').filter(Boolean)) {
    for (const name of ['pcsx2-qt', 'pcsx2']) if (runnable(join(dir, name))) add(join(dir, name));
  }
  return out;
}

/** The PCSX2 to use on Linux (see findPcsx2Candidates), or null. */
export function findLinuxPcsx2(o: { env?: NodeJS.ProcessEnv; home?: string; dirs?: string[] } = {}): string | null {
  return findPcsx2Candidates({ ...o, platform: 'linux' })[0] ?? null;
}

/** How to start PCSX2 on this OS: the command, its args and extra environment. */
export function pcsx2Command(platform: NodeJS.Platform, appPath: string, args: string[]): { cmd: string; args: string[]; env: Record<string, string> } {
  // macOS: `open -W` stays alive until PCSX2 quits; going through the app
  // bundle keeps macOS Gatekeeper happy.
  if (platform === 'darwin') return { cmd: 'open', args: ['-n', '-W', '-a', appPath, '--args', ...args], env: {} };
  // Linux: run it directly. X11 (xcb) so xdotool can focus and place its window.
  return { cmd: appPath, args, env: { QT_QPA_PLATFORM: 'xcb' } };
}

/**
 * pgrep args that find running PCSX2 processes. macOS: the PCSX2 executable
 * inside any .app bundle (stock, ours, or a renamed one from PCSX2_PATH).
 * Linux: any process whose name starts with pcsx2. An AppImage's process is
 * named after the file, cut to 15 characters (pcsx2-buzzparty, pcsx2-v2.8.2-li);
 * a distro package's is pcsx2-qt. The AppImage's AppRun wrapper is not matched,
 * which is right: window focus needs the real PCSX2 process. -x avoids matching
 * this app's own command line.
 */
export function pcsx2PgrepArgs(platform: NodeJS.Platform): [string, string] {
  return platform === 'darwin' ? ['-f', '\\.app/Contents/MacOS/PCSX2( |$)'] : ['-x', 'pcsx2.*'];
}

/** The OS side of running PCSX2, swappable for tests. */
export interface ProcessDeps {
  /** Starts PCSX2 with these args; the returned process exits when PCSX2 has quit. */
  spawnPcsx2(appPath: string, args: string[]): { kill(): boolean; once(e: 'exit', cb: () => void): unknown; on(e: 'exit', cb: () => void): unknown };
  /** Pids of every running PCSX2. */
  listPids(): Promise<number[]>;
  kill(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void;
  sleep(ms: number): Promise<void>;
}

export const realProcessDeps: ProcessDeps = {
  spawnPcsx2: (appPath, args) => {
    const c = pcsx2Command(process.platform, appPath, args);
    return spawn(c.cmd, c.args, { stdio: 'ignore', env: { ...process.env, ...c.env } });
  },
  listPids: async () => {
    try {
      const { stdout } = await promisify(execFile)('pgrep', pcsx2PgrepArgs(process.platform));
      return stdout.split('\n').map(Number).filter(n => n > 0);
    } catch {
      return [];
    }
  },
  kill: (pid, signal) => {
    try { process.kill(pid, signal); } catch { /* already gone */ }
  },
  sleep: ms => new Promise(r => setTimeout(r, ms)),
};

/** Thrown by launch() when stop() was called before the game was up. */
export class LaunchCancelled extends Error {
  override name = 'LaunchCancelled';
}

export interface LaunchOptions {
  biosDir: string;
  biosFile: string;
  /** Set when the TV is a separate (extended) display. */
  tvBounds?: Rect;
}

type Child = ReturnType<ProcessDeps['spawnPcsx2']>;

/** Runs one game at a time in PCSX2 with Buzz Party's own data dir. */
export class Pcsx2Manager {
  private child: Child | null = null;
  private pid: number | null = null;
  /** PCSX2 pids that already existed before our launch (the owner's own). */
  private foreign = new Set<number>();
  private exitListeners: (() => void)[] = [];
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** Each launch gets an id; stop() cancels whichever launch is in flight. */
  private launchId = 0;
  private cancelledId = -1;
  /** Our build's first try: if it exits before it is up, launch() falls back quietly. */
  private tryingPrimary: Child | null = null;
  private d: ProcessDeps;

  constructor(private o: { appPath: string; dataDir: string; template: string; bridge: KeyBridge; deps?: ProcessDeps; ledUdpPort?: number;
    /** Stock PCSX2 to use when appPath (our build) never starts, e.g. blocked by macOS. */
    fallbackAppPath?: string }) {
    this.d = o.deps ?? realProcessDeps;
  }

  get running(): boolean {
    return this.child !== null;
  }

  onExit(cb: () => void): void {
    this.exitListeners.push(cb);
  }

  async launch(game: Game, l: LaunchOptions): Promise<void> {
    if (this.child) await this.stop();
    const id = ++this.launchId;
    const cancelled = () => this.cancelledId === id;
    const ini = buildPcsx2Ini(this.o.template, {
      biosDir: l.biosDir,
      biosFile: l.biosFile,
      startFullscreen: !l.tvBounds,
      ledUdpPort: this.o.ledUdpPort,
    });
    const iniPath = pcsx2IniPath(this.o.dataDir);
    await mkdir(dirname(iniPath), { recursive: true });
    await writeFile(iniPath, ini);

    this.foreign = new Set(await this.d.listPids());
    if (cancelled()) throw new LaunchCancelled('Stopped before the game started');
    const args = [
      '-batch', '-nogui', l.tvBounds ? '-nofullscreen' : '-fullscreen',
      '-datapath', this.o.dataDir, '--', game.path];
    const spawn = (appPath: string): Child => {
      const c = this.d.spawnPcsx2(appPath, args);
      this.child = c;
      this.pid = null;
      c.on('exit', () => this.exited(c));
      return c;
    };
    let child = spawn(this.o.appPath);
    const fallback = this.o.fallbackAppPath;
    if (fallback) this.tryingPrimary = child;
    let pid = await this.findOurPid(child, 50);
    // Fall back only when our build exited (e.g. macOS refused to open it). If it
    // is merely slow, starting stock too could leave two emulators running.
    const primaryExited = this.child !== child;
    if (pid === null && fallback && primaryExited && !cancelled()) {
      console.warn(`PCSX2 at ${this.o.appPath} did not start; using ${fallback} (no buzzer lights)`);
      this.tryingPrimary = null;
      child = spawn(fallback);
      pid = await this.findOurPid(child, 50);
    }
    this.tryingPrimary = null;
    if (this.child !== child || cancelled()) throw new LaunchCancelled('Stopped before the game started');
    if (pid === null) {
      await this.stop();
      throw new Error('PCSX2 did not start');
    }
    this.pid = pid;

    if (l.tvBounds) {
      let placed = false;
      for (let i = 0; i < 20 && !placed && this.child === child; i++) {
        placed = await this.o.bridge.placeWindow(pid, l.tvBounds);
        if (!placed) await this.d.sleep(500);
      }
      this.focus();
      if (placed) {
        await this.d.sleep(300);
        this.o.bridge.toggleFullscreen();
      }
    }
    if (this.child !== child || cancelled()) throw new LaunchCancelled('Stopped before the game started');
    this.focus();
    // Other apps (notifications, launchers) can grab focus mid-game; PCSX2
    // only receives the buzzer keys while it is frontmost.
    this.watchdog = setInterval(() => this.focus(), 1000);
  }

  focus(): void {
    if (this.pid !== null) this.o.bridge.focusPid(this.pid);
  }

  async stop(): Promise<void> {
    this.cancelledId = this.launchId;
    this.tryingPrimary = null;
    const child = this.child;
    if (!child) return;
    const exited = new Promise<boolean>(r => child.once('exit', () => r(true)));
    const within = (ms: number) => Promise.race([exited, this.d.sleep(ms).then(() => false)]);

    // Mid-launch the pid may not be known yet: PCSX2 may still be starting.
    const pid = this.pid ?? (await this.findOurPid(child, 25));
    if (pid !== null) {
      this.d.kill(pid, 'SIGTERM');
      if (!(await within(5000))) {
        this.d.kill(pid, 'SIGKILL');
        await within(2000);
      }
    }
    // Whatever happened, this game is over as far as we're concerned.
    child.kill();
    this.exited(child);
  }

  private async findOurPid(child: Child, tries: number): Promise<number | null> {
    for (let i = 0; i < tries; i++) {
      const pid = (await this.d.listPids()).find(p => !this.foreign.has(p));
      if (pid !== undefined) return pid;
      if (this.child !== child) return null;
      await this.d.sleep(200);
    }
    return null;
  }

  private exited(child: Child): void {
    if (this.child !== child) return;
    this.child = null;
    this.pid = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    if (child === this.tryingPrimary) return; // launch() falls back to stock PCSX2
    for (const cb of this.exitListeners) cb();
  }
}
