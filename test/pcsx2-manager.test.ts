import { EventEmitter } from 'node:events';
import { FakeBridge } from '../src/bridge/fake.js';
import { Pcsx2Manager, pcsx2PgrepArgs, type ProcessDeps } from '../src/core/pcsx2-manager.js';
import { tmpDir } from './helpers/make-iso.js';

class FakeChild extends EventEmitter {
  killed = false;
  kill() {
    this.killed = true;
    this.emit('exit');
    return true;
  }
}

/** A fake OS: `pids` is what pgrep sees; killing our PCSX2 ends `open -W`. */
function fakeOs(o: { pids: number[]; ourPid: number; appearsAfter: number; obeysSignals?: boolean }) {
  let polls = 0;
  const child = new FakeChild();
  const killed: [number, string][] = [];
  const state = { spawned: false };
  const deps: ProcessDeps = {
    spawnPcsx2: () => { state.spawned = true; return child; },
    listPids: async () => (++polls > o.appearsAfter ? [...o.pids, o.ourPid] : [...o.pids]),
    kill: (pid, sig) => {
      killed.push([pid, sig]);
      if (pid === o.ourPid && o.obeysSignals !== false) child.emit('exit');
    },
    sleep: () => new Promise(r => setImmediate(r)),
  };
  return { deps, child, killed, state };
}

const game = { id: 'g', path: '/g.iso', serial: null, title: 'G', languages: [] };
const launchOpts = { biosDir: '/b', biosFile: 'b.bin' };
const make = (deps: ProcessDeps) =>
  new Pcsx2Manager({ appPath: '/A.app', dataDir: tmpDir(), template: '[UI]\n', bridge: new FakeBridge(), deps });

test('tracks the PCSX2 it started, not one the owner already had open', async () => {
  const os = fakeOs({ pids: [100], ourPid: 200, appearsAfter: 2 });
  const m = make(os.deps);
  await m.launch(game, launchOpts);
  await m.stop();
  expect(os.killed).toEqual([[200, 'SIGTERM']]);
});

test('back during launch, before the pid is known, still stops PCSX2', async () => {
  const os = fakeOs({ pids: [], ourPid: 200, appearsAfter: 3 });
  const m = make(os.deps);
  const launching = m.launch(game, launchOpts).catch((e: Error) => e);
  while (!os.state.spawned) await new Promise(r => setImmediate(r));
  await m.stop();
  expect(await launching).toMatchObject({ name: 'LaunchCancelled' });
  expect(os.killed).toEqual([[200, 'SIGTERM']]);
  expect(m.running).toBe(false);
});

test('back before PCSX2 is even spawned means it never starts', async () => {
  const os = fakeOs({ pids: [], ourPid: 200, appearsAfter: 1 });
  const m = make(os.deps);
  const launching = m.launch(game, launchOpts).catch((e: Error) => e);
  await m.stop();
  expect(await launching).toMatchObject({ name: 'LaunchCancelled' });
  expect(os.state.spawned).toBe(false);
  expect(m.running).toBe(false);
});

test('a launch that times out cleans up instead of leaving PCSX2 running', async () => {
  const os = fakeOs({ pids: [], ourPid: 200, appearsAfter: Infinity });
  const m = make(os.deps);
  await expect(m.launch(game, launchOpts)).rejects.toThrow('PCSX2 did not start');
  expect(os.child.killed).toBe(true);
  expect(m.running).toBe(false);
});

test('stop always finishes, even if PCSX2 ignores signals', async () => {
  const os = fakeOs({ pids: [], ourPid: 200, appearsAfter: 1, obeysSignals: false });
  const m = make(os.deps);
  const exits: number[] = [];
  m.onExit(() => exits.push(1));
  await m.launch(game, launchOpts);
  await m.stop();
  expect(os.killed).toEqual([[200, 'SIGTERM'], [200, 'SIGKILL']]);
  expect(m.running).toBe(false);
  expect(exits).toEqual([1]);
});

describe('fallback to stock PCSX2', () => {
  /** Our build exits at once (e.g. blocked by Gatekeeper); stock starts with pid 300. */
  function twoBuilds() {
    const spawned: string[] = [];
    let stockUp = false;
    const deps: ProcessDeps = {
      spawnPcsx2: appPath => {
        spawned.push(appPath);
        const child = new FakeChild();
        if (appPath === '/Ours.app') setImmediate(() => child.emit('exit'));
        else stockUp = true;
        return child;
      },
      listPids: async () => (stockUp ? [300] : []),
      kill: () => {},
      sleep: () => new Promise(r => setImmediate(r)),
    };
    return { deps, spawned };
  }

  test('falls back to stock when our build never starts', async () => {
    const os = twoBuilds();
    const m = new Pcsx2Manager({ appPath: '/Ours.app', fallbackAppPath: '/Stock.app', dataDir: tmpDir(), template: '[UI]\n', bridge: new FakeBridge(), deps: os.deps });
    const exits = vi.fn();
    m.onExit(exits);
    await m.launch(game, launchOpts);
    expect(os.spawned).toEqual(['/Ours.app', '/Stock.app']);
    expect(m.running).toBe(true);
    expect(exits).not.toHaveBeenCalled();
  });

  test('no fallback configured: an early exit still ends the launch', async () => {
    const os = twoBuilds();
    const m = new Pcsx2Manager({ appPath: '/Ours.app', dataDir: tmpDir(), template: '[UI]\n', bridge: new FakeBridge(), deps: os.deps });
    await expect(m.launch(game, launchOpts)).rejects.toBeInstanceOf(Error);
    expect(os.spawned).toEqual(['/Ours.app']);
    expect(m.running).toBe(false);
  });
});

test('our build hanging without a pid does not also start stock (no two emulators)', async () => {
  const spawned: string[] = [];
  const deps: ProcessDeps = {
    spawnPcsx2: appPath => { spawned.push(appPath); return new FakeChild(); }, // never exits, never shows a pid
    listPids: async () => [],
    kill: () => {},
    sleep: () => new Promise(r => setImmediate(r)),
  };
  const m = new Pcsx2Manager({ appPath: '/Ours.app', fallbackAppPath: '/Stock.app', dataDir: tmpDir(), template: '[UI]\n', bridge: new FakeBridge(), deps });
  await expect(m.launch(game, launchOpts)).rejects.toThrow('PCSX2 did not start');
  expect(spawned).toEqual(['/Ours.app']);
});

test('mac pgrep pattern finds any PCSX2 app bundle, not Buzz Party itself', () => {
  const [flag, pattern] = pcsx2PgrepArgs('darwin');
  expect(flag).toBe('-f');
  const re = new RegExp(pattern);
  expect(re.test('/Applications/PCSX2.app/Contents/MacOS/PCSX2 -batch -nogui')).toBe(true);
  expect(re.test('/Applications/PCSX2-BuzzParty.app/Contents/MacOS/PCSX2 -batch')).toBe(true);
  expect(re.test('/Applications/PCSX2 2.8.2.app/Contents/MacOS/PCSX2 -batch')).toBe(true);
  expect(re.test('open -n -W -a /Applications/PCSX2.app --args -batch')).toBe(false);
  expect(re.test('/Applications/Buzz Party.app/Contents/MacOS/Buzz Party')).toBe(false);
  expect(pcsx2PgrepArgs('linux')).toEqual(['-x', 'pcsx2.*']);
});

test('linux pgrep pattern finds AppImage and packaged PCSX2, not the AppRun wrapper', () => {
  const [flag, pattern] = pcsx2PgrepArgs('linux');
  expect(flag).toBe('-x');
  const whole = new RegExp(`^(?:${pattern})$`); // pgrep -x matches the whole process name
  for (const name of ['pcsx2-qt', 'pcsx2', 'pcsx2-buzzparty', 'pcsx2-v2.8.2-li']) expect(whole.test(name)).toBe(true);
  for (const name of ['AppRun', 'buzz-party', 'buzzhelper']) expect(whole.test(name)).toBe(false);
});
