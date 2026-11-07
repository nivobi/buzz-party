import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeBridge } from '../src/bridge/fake.js';
import { findLinuxPcsx2, findPcsx2Candidates, isBuzzPartyBuild, pcsx2Command, Pcsx2Manager, type ProcessDeps } from '../src/core/pcsx2-manager.js';
import { tmpDir } from './helpers/make-iso.js';

function exe(dir: string, name: string, mode = 0o755): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, '#!/bin/sh\n');
  chmodSync(p, mode);
  return p;
}

describe('findLinuxPcsx2', () => {
  test('uses PCSX2_PATH first', () => {
    const d = tmpDir();
    const p = exe(d, 'my-pcsx2');
    expect(findLinuxPcsx2({ env: { PCSX2_PATH: p }, dirs: [], home: d })).toBe(p);
  });

  test('picks the newest AppImage in the first folder that has one', () => {
    const d = tmpDir();
    exe(d, 'pcsx2-v2.2.0-linux-appimage-x64-Qt.AppImage');
    const newest = exe(d, 'pcsx2-v2.4.0-linux-appimage-x64-Qt.AppImage');
    exe(d, 'notes.txt');
    expect(findLinuxPcsx2({ env: {}, dirs: [tmpDir(), d], home: d })).toBe(newest);
  });

  test('skips AppImages that are not executable', () => {
    const d = tmpDir();
    exe(d, 'pcsx2-v2.4.0.AppImage', 0o644);
    expect(findLinuxPcsx2({ env: {}, dirs: [d], home: d })).toBeNull();
  });

  test('falls back to pcsx2-qt on the PATH', () => {
    const bin = tmpDir();
    const p = exe(bin, 'pcsx2-qt');
    expect(findLinuxPcsx2({ env: { PATH: `/nonexistent:${bin}` }, dirs: [], home: bin })).toBe(p);
  });

  test('null when nothing is installed', () => {
    expect(findLinuxPcsx2({ env: { PATH: '' }, dirs: [tmpDir()], home: '/x' })).toBeNull();
  });
});

describe('pcsx2Command', () => {
  const args = ['-batch', '-nogui'];

  test('macOS goes through `open`', () => {
    expect(pcsx2Command('darwin', '/Applications/PCSX2.app', args)).toEqual({
      cmd: 'open', args: ['-n', '-W', '-a', '/Applications/PCSX2.app', '--args', '-batch', '-nogui'], env: {},
    });
  });

  test('Linux runs the file directly on X11', () => {
    expect(pcsx2Command('linux', '/opt/pcsx2/x.AppImage', args)).toEqual({
      cmd: '/opt/pcsx2/x.AppImage', args, env: { QT_QPA_PLATFORM: 'xcb' },
    });
  });
});

test('the manager hands the app path and PCSX2 args to the OS layer', async () => {
  const calls: { appPath: string; args: string[] }[] = [];
  const listeners: (() => void)[] = [];
  const child = { kill: () => true, once: (_: 'exit', cb: () => void) => listeners.push(cb), on: (_: 'exit', cb: () => void) => listeners.push(cb) };
  let polls = 0;
  const deps: ProcessDeps = {
    spawnPcsx2: (appPath, args) => { calls.push({ appPath, args }); return child; },
    listPids: async () => (++polls > 1 ? [321] : []),
    kill: () => { for (const cb of listeners) cb(); },
    sleep: () => new Promise(r => setImmediate(r)),
  };
  const dataDir = tmpDir();
  const m = new Pcsx2Manager({ appPath: '/opt/pcsx2/x.AppImage', dataDir, template: '[UI]\n', bridge: new FakeBridge(), deps });
  await m.launch({ id: 'g', path: '/g.iso', serial: null, title: 'G', languages: [] }, { biosDir: '/b', biosFile: 'b.bin' });
  expect(calls).toEqual([{
    appPath: '/opt/pcsx2/x.AppImage',
    args: ['-batch', '-nogui', '-fullscreen', '-datapath', dataDir, '--', '/g.iso'],
  }]);
  await m.stop();
});

describe('our build first', () => {
  const has = (...paths: string[]) => (p: string) => paths.includes(p);

  test('mac prefers our build, then stock', () => {
    const exists = has('/Applications/PCSX2.app', '/Applications/PCSX2-BuzzParty.app');
    expect(findPcsx2Candidates({ platform: 'darwin', env: {}, home: '/Users/x', exists }))
      .toEqual(['/Applications/PCSX2-BuzzParty.app', '/Applications/PCSX2.app']);
  });

  test('mac also looks in ~/Applications', () => {
    const exists = has('/Users/x/Applications/PCSX2-BuzzParty.app', '/Applications/PCSX2.app');
    expect(findPcsx2Candidates({ platform: 'darwin', env: {}, home: '/Users/x', exists }))
      .toEqual(['/Users/x/Applications/PCSX2-BuzzParty.app', '/Applications/PCSX2.app']);
  });

  test('PCSX2_PATH wins on mac too', () => {
    const exists = has('/x/My.app', '/Applications/PCSX2.app');
    expect(findPcsx2Candidates({ platform: 'darwin', env: { PCSX2_PATH: '/x/My.app' }, home: '/Users/x', exists })[0]).toBe('/x/My.app');
  });

  test('linux prefers a buzzparty AppImage', () => {
    const d = tmpDir();
    const stock = exe(d, 'pcsx2-v2.9.0.AppImage');
    const ours = exe(d, 'pcsx2-buzzparty-2.8.2.AppImage');
    expect(findPcsx2Candidates({ platform: 'linux', env: {}, dirs: [d], home: d })).toEqual([ours, stock]);
    expect(findLinuxPcsx2({ env: {}, dirs: [d], home: d })).toBe(ours);
  });

  test('isBuzzPartyBuild', () => {
    expect(isBuzzPartyBuild('/Applications/PCSX2-BuzzParty.app')).toBe(true);
    expect(isBuzzPartyBuild('/home/x/Applications/pcsx2-buzzparty-2.8.2.AppImage')).toBe(true);
    expect(isBuzzPartyBuild('/Applications/PCSX2.app')).toBe(false);
    expect(isBuzzPartyBuild('/opt/pcsx2/pcsx2-v2.9.0.AppImage')).toBe(false);
  });
});
