import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LinuxBridge, type Run } from '../src/bridge/linux.js';
import { LINUX_KEYCODES, MAC_KEYCODES } from '../src/shared/keymap.js';
import { tmpDir } from './helpers/make-iso.js';

// A stand-in for the C helper: logs each command and answers like it would.
function fakeHelper(dir: string, trust = 'yes'): { path: string; log: () => string[] } {
  const path = join(dir, 'helper.sh');
  const logFile = join(dir, 'log');
  writeFileSync(path, `#!/bin/sh
while read line; do
  echo "$line" >> "${logFile}"
  case "$line" in
    trust*) echo ${trust} ;;
    *) echo ok ;;
  esac
done
`);
  chmodSync(path, 0o755);
  return { path, log: () => { try { return readFileSync(logFile, 'utf8').trim().split('\n'); } catch { return []; } } };
}

const until = async (f: () => boolean) => { for (let i = 0; i < 400 && !f(); i++) await new Promise(r => setTimeout(r, 5)); };

test('keys are sent to the helper as Linux key codes', async () => {
  const h = fakeHelper(tmpDir());
  const bridge = new LinuxBridge(h.path, async () => ({ ok: true, out: '' }));
  try {
    bridge.keyDown('Q');
    bridge.keyUp('Q');
    bridge.keyDown('1');
    bridge.toggleFullscreen();
    await until(() => h.log().length >= 4);
    expect(h.log()).toEqual(['down 16', 'up 16', 'down 2', 'fullscreen']);
  } finally {
    bridge.dispose();
  }
});

test('trusted follows the helper, and re-checks without restarting it', async () => {
  const yes = new LinuxBridge(fakeHelper(tmpDir(), 'yes').path, async () => ({ ok: true, out: '' }));
  const no = new LinuxBridge(fakeHelper(tmpDir(), 'no').path, async () => ({ ok: true, out: '' }));
  try {
    expect(await yes.isTrusted()).toBe(true);
    expect(await no.isTrusted()).toBe(false);
    expect(await no.isTrusted()).toBe(false);
  } finally {
    yes.dispose();
    no.dispose();
  }
});

test('focus: does nothing when the game already has focus', async () => {
  const calls: string[][] = [];
  const run: Run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return { ok: true, out: '4242\n' };
  };
  const bridge = new LinuxBridge(fakeHelper(tmpDir()).path, run);
  try {
    bridge.focusPid(4242);
    await until(() => calls.length >= 1);
    await new Promise(r => setTimeout(r, 30));
    expect(calls).toEqual([['xdotool', 'getactivewindow', 'getwindowpid']]);
  } finally {
    bridge.dispose();
  }
});

test('focus: activates the game window when something else has focus', async () => {
  const calls: string[][] = [];
  const run: Run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return { ok: true, out: '1\n' };
  };
  const bridge = new LinuxBridge(fakeHelper(tmpDir()).path, run);
  try {
    bridge.focusPid(4242);
    await until(() => calls.length >= 2);
    expect(calls[1]).toEqual(['xdotool', 'search', '--onlyvisible', '--pid', '4242', 'windowactivate', '%1']);
  } finally {
    bridge.dispose();
  }
});

test('placeWindow moves and sizes the game window, and reports failure', async () => {
  const calls: string[][] = [];
  let ok = true;
  const run: Run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return { ok, out: '' };
  };
  const bridge = new LinuxBridge(fakeHelper(tmpDir()).path, run);
  try {
    expect(await bridge.placeWindow(7, { x: 1920, y: 0, width: 1920, height: 1080 })).toBe(true);
    expect(calls[0]).toEqual(['xdotool', 'search', '--onlyvisible', '--pid', '7', 'windowmove', '%1', '1920', '0', 'windowsize', '%1', '1920', '1080']);
    ok = false;
    expect(await bridge.placeWindow(7, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  } finally {
    bridge.dispose();
  }
});

test('a missing helper answers "not trusted" instead of throwing', async () => {
  const bridge = new LinuxBridge('/nonexistent/buzzhelper', async () => ({ ok: true, out: '' }));
  try {
    expect(await bridge.isTrusted()).toBe(false);
  } finally {
    bridge.dispose();
  }
});

test('Linux key codes cover the same keys as macOS, with no duplicates', () => {
  expect(Object.keys(LINUX_KEYCODES).sort()).toEqual(Object.keys(MAC_KEYCODES).sort());
  const codes = Object.values(LINUX_KEYCODES);
  expect(new Set(codes).size).toBe(codes.length);
});
