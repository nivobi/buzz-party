import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startServer, type PhoneHub } from '../src/server/server.js';
import { tmpDir } from './helpers/make-iso.js';

class FakeHub implements PhoneHub {
  calls: unknown[][] = [];
  private cbs: (() => void)[] = [];
  phone(token: string, msg: unknown) { this.calls.push(['phone', token, msg]); }
  disconnected(token: string) { this.calls.push(['disconnected', token]); }
  phoneState(token: string) { return { t: 'state' as const, mode: 'picker' as const, you: null, slots: [], joinUrl: `u-${token}`, qr: '' }; }
  onChange(cb: () => void) { this.cbs.push(cb); }
  fire() { for (const cb of this.cbs) cb(); }
}

const webDir = tmpDir();
writeFileSync(join(webDir, 'index.html'), '<h1>buzz</h1>');
const closers: (() => Promise<void>)[] = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

async function start(hub = new FakeHub(), port = 0, heartbeatMs?: number) {
  const s = await startServer(hub, { webDir, port, maxPort: port === 0 ? 0 : port + 3, heartbeatMs });
  closers.push(s.close);
  return { hub, s };
}

function connect(port: number, opts: WebSocket.ClientOptions = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, opts);
  const msgs: any[] = [];
  ws.on('message', d => msgs.push(JSON.parse(String(d))));
  closers.push(async () => ws.close());
  const next = async (n: number) => { while (msgs.length < n) await new Promise(r => setTimeout(r, 5)); return msgs[n - 1]; };
  return { ws, msgs, next, open: new Promise(r => ws.once('open', r)) };
}

const until = async (f: () => boolean) => { while (!f()) await new Promise(r => setTimeout(r, 5)); };

test('serves the phone page', async () => {
  const { s } = await start();
  const res = await fetch(`http://127.0.0.1:${s.port}/index.html`);
  expect(await res.text()).toBe('<h1>buzz</h1>');
  expect(res.headers.get('content-type')).toMatch(/text\/html/);
});

test('rejects path traversal and missing files', async () => {
  const { s } = await start();
  expect((await fetch(`http://127.0.0.1:${s.port}/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
  expect((await fetch(`http://127.0.0.1:${s.port}/nope.js`)).status).toBe(404);
});

test('hello gets state, messages reach the hub, close disconnects', async () => {
  const { hub, s } = await start();
  const c = connect(s.port);
  await c.open;
  c.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  expect(await c.next(1)).toMatchObject({ t: 'state', joinUrl: 'u-tok' });
  c.ws.send(JSON.stringify({ t: 'claim', slot: 2 }));
  c.ws.send(JSON.stringify({ t: 'btn', b: 'red', down: true }));
  await until(() => hub.calls.length >= 3);
  expect(hub.calls).toEqual([
    ['phone', 'tok', { t: 'hello', token: 'tok' }],
    ['phone', 'tok', { t: 'claim', slot: 2 }],
    ['phone', 'tok', { t: 'btn', b: 'red', down: true }],
  ]);
  hub.fire();
  expect(await c.next(2)).toMatchObject({ t: 'state' });
  c.ws.close();
  await until(() => hub.calls.some(x => x[0] === 'disconnected'));
  expect(hub.calls.at(-1)).toEqual(['disconnected', 'tok']);
});

test('junk messages are ignored and the socket stays open', async () => {
  const { hub, s } = await start();
  const c = connect(s.port);
  await c.open;
  c.ws.send(JSON.stringify({ t: 'btn', b: 'red', down: true })); // before hello
  c.ws.send('not json');
  c.ws.send(JSON.stringify({ t: 'weird' }));
  c.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  c.ws.send(JSON.stringify({ t: 'claim', slot: 9 }));
  c.ws.send(JSON.stringify({ t: 'btn', b: 'purple', down: true }));
  await c.next(1);
  await new Promise(r => setTimeout(r, 30));
  expect(hub.calls).toEqual([['phone', 'tok', { t: 'hello', token: 'tok' }]]);
  expect(c.ws.readyState).toBe(WebSocket.OPEN);
});

test('takes the next port when one is busy', async () => {
  const blocker = createServer();
  await new Promise<void>(r => blocker.listen(0, r));
  const busy = (blocker.address() as { port: number }).port;
  closers.push(() => new Promise(r => blocker.close(() => r())));
  const { s } = await start(new FakeHub(), busy);
  expect(s.port).toBe(busy + 1);
});

test('the TV page subscribes with {t:"tv"} and gets tv state on every change', async () => {
  const hub = new FakeHub() as FakeHub & { tvState(): unknown };
  hub.tvState = () => ({ mode: 'picker', marker: 'tv' });
  const { s } = await start(hub);
  const c = connect(s.port);
  await c.open;
  c.ws.send(JSON.stringify({ t: 'tv' }));
  expect(await c.next(1)).toEqual({ t: 'tv', state: { mode: 'picker', marker: 'tv' } });
  hub.fire();
  expect(await c.next(2)).toEqual({ t: 'tv', state: { mode: 'picker', marker: 'tv' } });
  expect(hub.calls).toEqual([]);
});

test('root redirects to the phone page; covers are served from the covers dir', async () => {
  const covers = tmpDir();
  writeFileSync(join(covers, 'SCUS-97597.png'), 'png');
  const s = await startServer(new FakeHub(), { webDir, port: 0, maxPort: 0, coversDir: covers });
  closers.push(s.close);
  const r = await fetch(`http://127.0.0.1:${s.port}/`, { redirect: 'manual' });
  expect(r.status).toBe(302);
  expect(r.headers.get('location')).toBe('/phone/');
  expect(await (await fetch(`http://127.0.0.1:${s.port}/covers/SCUS-97597.png`)).text()).toBe('png');
  expect((await fetch(`http://127.0.0.1:${s.port}/covers/..%2findex.html`)).status).toBe(404);
});

test('a phone that goes silent (no pong) is dropped and disconnected', async () => {
  const { hub, s } = await start(new FakeHub(), 0, 50);
  const c = connect(s.port, { autoPong: false });
  await c.open;
  c.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  await c.next(1);
  await until(() => hub.calls.some(x => x[0] === 'disconnected'));
  expect(hub.calls.at(-1)).toEqual(['disconnected', 'tok']);
});

test('a phone that answers pings stays connected', async () => {
  const { hub, s } = await start(new FakeHub(), 0, 30);
  const c = connect(s.port);
  await c.open;
  c.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  await c.next(1);
  await new Promise(r => setTimeout(r, 200));
  expect(hub.calls.some(x => x[0] === 'disconnected')).toBe(false);
});

test('reconnecting closes the old socket without marking the phone disconnected', async () => {
  const { hub, s } = await start();
  const a = connect(s.port);
  await a.open;
  a.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  await a.next(1);
  const b = connect(s.port);
  await b.open;
  b.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  await b.next(1);
  await until(() => a.ws.readyState === WebSocket.CLOSED);
  await new Promise(r => setTimeout(r, 30));
  expect(hub.calls.filter(x => x[0] === 'disconnected')).toEqual([]);
  b.ws.close();
  await until(() => hub.calls.some(x => x[0] === 'disconnected'));
});

test('a second hello with a different token on one socket is ignored', async () => {
  const { hub, s } = await start();
  const c = connect(s.port);
  await c.open;
  c.ws.send(JSON.stringify({ t: 'hello', token: 'one' }));
  await c.next(1);
  c.ws.send(JSON.stringify({ t: 'hello', token: 'two' }));
  c.ws.send(JSON.stringify({ t: 'claim', slot: 1 }));
  await until(() => hub.calls.length >= 2);
  expect(hub.calls).toEqual([
    ['phone', 'one', { t: 'hello', token: 'one' }],
    ['phone', 'one', { t: 'claim', slot: 1 }],
  ]);
});

test('language messages: only known languages pass, and the TV can pick one too', async () => {
  const hub = Object.assign(new FakeHub(), { setLang: vi.fn(), tvState: () => ({ mode: 'picker' }) as any });
  const { s } = await start(hub);

  const phone = connect(s.port);
  await phone.open;
  phone.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  phone.ws.send(JSON.stringify({ t: 'lang', lang: 'klingon' }));
  phone.ws.send(JSON.stringify({ t: 'lang', lang: 'da' }));
  await until(() => hub.calls.length >= 2);
  expect(hub.calls).toEqual([
    ['phone', 'tok', { t: 'hello', token: 'tok' }],
    ['phone', 'tok', { t: 'lang', lang: 'da' }],
  ]);

  const tv = connect(s.port);
  await tv.open;
  tv.ws.send('{"t":"tv"}');
  await tv.next(1);
  tv.ws.send(JSON.stringify({ t: 'lang', lang: 'en' }));
  await until(() => hub.setLang.mock.calls.length >= 1);
  expect(hub.setLang).toHaveBeenCalledWith('en');
});

test('sound messages need a real boolean', async () => {
  const { hub, s } = await start();
  const c = connect(s.port);
  await c.open;
  c.ws.send(JSON.stringify({ t: 'hello', token: 'tok' }));
  c.ws.send(JSON.stringify({ t: 'sound', on: 'yes' }));
  c.ws.send(JSON.stringify({ t: 'sound', on: false }));
  await until(() => hub.calls.length >= 2);
  expect(hub.calls).toEqual([
    ['phone', 'tok', { t: 'hello', token: 'tok' }],
    ['phone', 'tok', { t: 'sound', on: false }],
  ]);
});
