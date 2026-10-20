import { EventEmitter } from 'node:events';
import { FakeBridge } from '../src/bridge/fake.js';
import { Pcsx2Manager, type ProcessDeps } from '../src/core/pcsx2-manager.js';
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
    spawnOpen: () => { state.spawned = true; return child; },
    listPids: async () => (++polls > o.appearsAfter ? [...o.pids, o.ourPid] : [...o.pids]),
    kill: (pid, sig) => {
      killed.push([pid, sig]);
      if (pid === o.ourPid && o.obeysSignals !== false) child.emit('exit');
    },
    sleep: () => new Promise(r => setImmediate(r)),
  };
  return { deps, child, killed, state };
}

const game = { id: 'g', path: '/g.iso', serial: null, title: 'G' };
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
