import { createSocket } from 'node:dgram';
import { parseLights, startFakeLights, startLightListener } from '../src/core/lights.js';
import type { Lights } from '../src/shared/protocol.js';

function sendTo(port: number, ...msgs: string[]) {
  const sock = createSocket('udp4');
  return (async () => {
    for (const m of msgs) await new Promise<void>(r => sock.send(m, port, '127.0.0.1', () => r()));
    sock.close();
  })();
}

const until = async (f: () => boolean) => { while (!f()) await new Promise(r => setTimeout(r, 5)); };

test('parses a valid datagram', () => {
  expect(parseLights('buzzled 1 1 0 1 0')).toEqual([true, false, true, false]);
  expect(parseLights(Buffer.from('buzzled 1 0 0 0 1\n'))).toEqual([false, false, false, true]);
});

test('rejects anything else', () => {
  for (const s of ['', 'buzzled 2 1 0 1 0', 'buzzled 1 1 0 1', 'buzzled 1 1 0 1 0 1', 'buzzled 1 2 0 0 0', 'hello', 'buzzled 1  1 0 1 0'])
    expect(parseLights(s)).toBeNull();
});

test('listener delivers datagrams sent to 127.0.0.1', async () => {
  const got: Lights[] = [];
  const l = await startLightListener(x => got.push(x));
  await sendTo(l.port, 'buzzled 1 1 1 0 0');
  await until(() => got.length === 1);
  expect(got[0]).toEqual([true, true, false, false]);
  await l.close();
});

test('listener ignores junk', async () => {
  const got: Lights[] = [];
  const l = await startLightListener(x => got.push(x));
  await sendTo(l.port, 'nope', 'buzzled 1 0 1 0 0');
  await until(() => got.length >= 1);
  await new Promise(r => setTimeout(r, 20));
  expect(got).toEqual([[false, true, false, false]]);
  await l.close();
});

test('fake lights produce a chase', () => {
  vi.useFakeTimers();
  try {
    const got: Lights[] = [];
    const f = startFakeLights(x => got.push(x), { intervalMs: 10 });
    vi.advanceTimersByTime(40);
    expect(got.slice(0, 4)).toEqual([
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
    ]);
    f.stop();
  } finally {
    vi.useRealTimers();
  }
});
