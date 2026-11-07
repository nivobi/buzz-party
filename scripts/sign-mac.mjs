// Signs the packaged macOS app after `electron-builder --mac dir`.
//
// Uses the certificate named in BUZZ_SIGN_IDENTITY, or "Buzz Party Local Signing" by
// default. A fixed certificate lets macOS keep the Accessibility permission between
// rebuilds. Without one the app is signed ad hoc: it still runs, but macOS asks for
// Accessibility again after every rebuild.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const name = process.env.BUZZ_SIGN_IDENTITY || 'Buzz Party Local Signing';

// electron-builder writes mac-arm64/ on Apple Silicon and mac/ on Intel.
const app = ['mac-arm64', 'mac', 'mac-x64', 'mac-universal']
  .map(dir => `dist-app/${dir}/Buzz Party.app`)
  .find(existsSync);
if (!app) {
  console.error('sign-mac: no packaged app found in dist-app/. Did electron-builder run?');
  process.exit(1);
}

let identities = '';
try {
  identities = execFileSync('security', ['find-identity', '-p', 'codesigning'], { encoding: 'utf8' });
} catch {
  // No keychain access: fall back to ad hoc below.
}
const found = identities.includes(`"${name}"`);
if (!found) {
  console.warn(
    `sign-mac: no code signing certificate named "${name}", signing ad hoc.\n` +
      '  The app works, but macOS will ask for Accessibility again after each rebuild.\n' +
      '  See "Keep the Accessibility permission" in the README to create one.',
  );
}

execFileSync('codesign', ['--force', '--deep', '-s', found ? name : '-', app], { stdio: 'inherit' });
console.log(`sign-mac: signed ${app} (${found ? name : 'ad hoc'})`);
