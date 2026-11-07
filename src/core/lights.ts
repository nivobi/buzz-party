import { createSocket } from 'node:dgram';
import type { Lights } from '../shared/protocol.js';

export const LIGHTS_OFF: Lights = [false, false, false, false];

/** "buzzled 1 L1 L2 L3 L4" from the patched PCSX2; anything else is null. */
export function parseLights(data: Buffer | string): Lights | null {
  const m = /^buzzled 1 ([01]) ([01]) ([01]) ([01])\n?$/.exec(String(data));
  if (!m) return null;
  return [m[1] === '1', m[2] === '1', m[3] === '1', m[4] === '1'];
}

/** Listens on 127.0.0.1 only for light datagrams from PCSX2. */
export function startLightListener(
  onLights: (l: Lights) => void,
  o: { port?: number } = {},
): Promise<{ port: number; close(): Promise<void> }> {
  const sock = createSocket('udp4');
  sock.on('message', msg => {
    const l = parseLights(msg);
    if (l) onLights(l);
  });
  return new Promise((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(o.port ?? 0, '127.0.0.1', () => {
      sock.off('error', reject);
      // A broken socket later on just means no more lights.
      sock.on('error', () => {});
      resolve({
        port: sock.address().port,
        close: () => new Promise<void>(r => sock.close(() => r())),
      });
    });
  });
}

const PATTERN: Lights[] = [
  [true, false, false, false],
  [false, true, false, false],
  [false, false, true, false],
  [false, false, false, true],
  [true, true, true, true],
  LIGHTS_OFF,
  [true, true, true, true],
  LIGHTS_OFF,
];

/** A made-up light show for working on the phones without PCSX2 (BUZZ_FAKE_LIGHTS=1). */
export function startFakeLights(onLights: (l: Lights) => void, o: { intervalMs?: number } = {}): { stop(): void } {
  let i = 0;
  const timer = setInterval(() => onLights(PATTERN[i++ % PATTERN.length]), o.intervalMs ?? 400);
  return { stop: () => clearInterval(timer) };
}
