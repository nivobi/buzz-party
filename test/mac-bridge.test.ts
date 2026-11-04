import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MacBridge } from '../src/bridge/mac.js';
import { tmpDir } from './helpers/make-iso.js';

// Like macOS, this fake helper decides "trusted" once, when it starts. It waits a
// moment first, so a test can write the "granted" file after restarting it
// without racing the process start-up (which is much faster on Linux).
function fakeHelper(dir: string): string {
  const path = join(dir, 'helper.sh');
  writeFileSync(path, `#!/bin/sh
sleep 0.2
if [ -f "${dir}/granted" ]; then T=yes; else T=no; fi
while read line; do echo "$T"; done
`);
  chmodSync(path, 0o755);
  return path;
}

test('a fresh helper re-checks trust after permission is granted', async () => {
  const dir = tmpDir();
  const bridge = new MacBridge(fakeHelper(dir));
  try {
    expect(await bridge.isTrusted(false)).toBe(false);
    writeFileSync(join(dir, 'granted'), '');
    expect(await bridge.isTrusted(false)).toBe(true);
  } finally {
    bridge.dispose();
  }
});
