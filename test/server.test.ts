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

async function start(hub = new FakeHub(), port = 0) {
  const s = await startServer(hub, { webDir, port, maxPort: port === 0 ? 0 : port + 3 });
  closers.push(s.close);
  return { hub, s };
}

function connect(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
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
