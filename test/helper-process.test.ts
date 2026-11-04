import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HelperProcess } from '../src/bridge/helper.js';
import { MacBridge } from '../src/bridge/mac.js';
import { tmpDir } from './helpers/make-iso.js';

const until = async (f: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
};
const lines = (file: string) => { try { return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };

test('a helper that keeps crashing is restarted a few times, then reported dead', async () => {
  const dir = tmpDir();
  const log = join(dir, 'starts');
  const path = join(dir, 'crash.sh');
  writeFileSync(path, `#!/bin/sh\necho started >> "${log}"\nexit 1\n`);
  chmodSync(path, 0o755);
  const h = new HelperProcess(path);
  try {
    await until(() => !h.alive && lines(log).length >= 4);
    await new Promise(r => setTimeout(r, 200));
    expect(lines(log).length).toBe(4); // the first start plus three restarts
    expect(h.alive).toBe(false);
    expect(await h.send('anything')).toBe('fail');
  } finally {
    h.dispose();
  }
});

test('a helper that cannot be started is dead right away', async () => {
  const h = new HelperProcess('/nonexistent/helper');
  try {
    await until(() => !h.alive);
    expect(h.alive).toBe(false);
  } finally {
    h.dispose();
  }
});

test('a healthy helper reports alive', async () => {
  const dir = tmpDir();
  const path = join(dir, 'ok.sh');
  writeFileSync(path, '#!/bin/sh\nwhile read line; do echo ok; done\n');
  chmodSync(path, 0o755);
  const h = new HelperProcess(path);
  try {
    expect(await h.send('x')).toBe('ok');
    expect(h.alive).toBe(true);
  } finally {
    h.dispose();
  }
});

test('Mac bridge: a slow window command does not hold back key presses', async () => {
  const dir = tmpDir();
  const log = join(dir, 'log');
  const path = join(dir, 'helper.sh');
  // Logs "<pid> <command>" when a command starts; "focus" then takes a second.
  writeFileSync(path, `#!/bin/sh
while read line; do
  echo "$$ $line" >> "${log}"
  case "$line" in focus*) sleep 1 ;; esac
  echo ok
done
`);
  chmodSync(path, 0o755);
  const bridge = new MacBridge(path);
  try {
    bridge.focusPid(4242);
    await until(() => lines(log).some(l => l.endsWith('focus 4242')));
    bridge.keyDown('Q');
    // Within a fraction of the focus's second, the key press has been handled.
    await until(() => lines(log).some(l => l.endsWith('down 12')), 400);
    const entries = lines(log).map(l => l.split(' '));
    const focus = entries.find(e => e[1] === 'focus')!;
    const down = entries.find(e => e[1] === 'down')!;
    expect(down).toBeDefined();
    expect(down[0]).not.toBe(focus[0]); // a different process
  } finally {
    bridge.dispose();
  }
});

test('Mac bridge reports alive only while both helpers run', async () => {
  const dir = tmpDir();
  const path = join(dir, 'ok.sh');
  writeFileSync(path, '#!/bin/sh\nwhile read line; do echo ok; done\n');
  chmodSync(path, 0o755);
  const good = new MacBridge(path);
  const bad = new MacBridge('/nonexistent/helper');
  try {
    expect(good.isAlive()).toBe(true);
    await until(() => !bad.isAlive());
    expect(bad.isAlive()).toBe(false);
  } finally {
    good.dispose();
    bad.dispose();
  }
});
