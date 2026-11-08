import { fetchNetsetup } from '../src/core/netsetup.js';

const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})) as unknown as typeof fetch;

test('fetchNetsetup returns null on refused / bad JSON / timeout', async () => {
  const refused = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  expect(await fetchNetsetup(refused)).toBeNull();

  const junk = (async () => new Response('<html>nope', { status: 200 })) as unknown as typeof fetch;
  expect(await fetchNetsetup(junk)).toBeNull();

  const notObject = ok([1, 2, 3]);
  expect(await fetchNetsetup(notObject)).toBeNull();

  const serverError = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
  expect(await fetchNetsetup(serverError)).toBeNull();

  const hang = ((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
    init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  })) as unknown as typeof fetch;
  const t0 = Date.now();
  expect(await fetchNetsetup(hang, 'http://127.0.0.1:8431/status', 50)).toBeNull();
  expect(Date.now() - t0).toBeLessThan(1000);
});

test('maps hotspot with error', async () => {
  const f = ok({ mode: 'hotspot', ssid: 'Café "Ø" 🎉', error: 'wrong_password', hotspot_ssid: 'BuzzParty-Setup' });
  expect(await fetchNetsetup(f)).toEqual({
    mode: 'hotspot', ssid: 'Café "Ø" 🎉', error: 'wrong_password', hotspotSsid: 'BuzzParty-Setup', qr: null,
  });
});

test('maps joining and connected', async () => {
  expect(await fetchNetsetup(ok({ mode: 'joining', ssid: 'Home', error: null, hotspot_ssid: 'BuzzParty-Setup' })))
    .toMatchObject({ mode: 'joining', ssid: 'Home', error: null });
  expect(await fetchNetsetup(ok({ mode: 'connected', ssid: 'Home', error: null, hotspot_ssid: 'BuzzParty-Setup' })))
    .toMatchObject({ mode: 'connected', ssid: 'Home' });
});

test('ignores off/client/waiting', async () => {
  for (const mode of ['off', 'client', 'waiting', 'bogus']) {
    expect(await fetchNetsetup(ok({ mode, ssid: null, error: null, hotspot_ssid: 'BuzzParty-Setup' }))).toBeNull();
  }
});

test('unknown error codes and odd field types are dropped', async () => {
  const v = await fetchNetsetup(ok({ mode: 'hotspot', ssid: 42, error: 'kaboom', hotspot_ssid: null }));
  expect(v).toEqual({ mode: 'hotspot', ssid: null, error: null, hotspotSsid: 'BuzzParty-Setup', qr: null });
});

test('asks the default URL', async () => {
  const seen: string[] = [];
  const f = (async (url: string) => { seen.push(url); throw new Error('x'); }) as unknown as typeof fetch;
  await fetchNetsetup(f);
  expect(seen).toEqual(['http://127.0.0.1:8431/status']);
});
