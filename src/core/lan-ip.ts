import { execFile } from 'node:child_process';
import type { NetworkInterfaceInfo } from 'node:os';
import { promisify } from 'node:util';

const VIRTUAL_IFACE = /^(docker|br-|veth|utun|bridge|vmnet|vboxnet|tailscale)/;
const PHYSICAL_IFACE = /^(en|eth|wl)/;

function isPrivate(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isExcluded(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 127 || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/** The LAN IPv4 phones can reach, for the join QR code. Null if none. */
export function pickLanIp(ifaces: NodeJS.Dict<NetworkInterfaceInfo[]>, defaultIface?: string): string | null {
  const candidates: { name: string; ip: string }[] = [];
  for (const [name, infos] of Object.entries(ifaces)) {
    if (!infos || VIRTUAL_IFACE.test(name)) continue;
    for (const i of infos) {
      if (i.family === 'IPv4' && !i.internal && !isExcluded(i.address)) candidates.push({ name, ip: i.address });
    }
  }
  const pick =
    candidates.find(c => c.name === defaultIface) ??
    candidates.find(c => PHYSICAL_IFACE.test(c.name)) ??
    candidates.find(c => isPrivate(c.ip)) ??
    candidates[0];
  return pick?.ip ?? null;
}

/** Name of the interface holding the default route (macOS), if known. */
export async function defaultRouteInterface(): Promise<string | undefined> {
  if (process.platform !== 'darwin') return undefined;
  try {
    const { stdout } = await promisify(execFile)('route', ['-n', 'get', 'default']);
    return /interface:\s*(\S+)/.exec(stdout)?.[1];
  } catch {
    return undefined;
  }
}
