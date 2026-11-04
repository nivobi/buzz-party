import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { BUTTONS, SLOTS } from '../shared/keymap.js';
import { isLang } from '../core/i18n.js';
import type { PhoneMsg, PhoneState, TvState } from '../shared/protocol.js';

/** The part of the Controller the server talks to. */
export interface PhoneHub {
  phone(token: string, msg: PhoneMsg): void;
  disconnected(token: string): void;
  phoneState(token: string): PhoneState;
  onChange(cb: () => void): void;
  /** Present when a TV page may subscribe (the real Controller). */
  tvState?(): TvState;
  /** The TV page (mouse or remote) picked a language. */
  setLang?(lang: string): void;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Accepts only well-formed phone messages; everything else is dropped. */
function parseMsg(raw: string): PhoneMsg | null {
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'hello':
      return typeof m.token === 'string' && m.token.length > 0 && m.token.length <= 100 ? { t: 'hello', token: m.token } : null;
    case 'claim':
      return SLOTS.includes(m.slot) ? { t: 'claim', slot: m.slot } : null;
    case 'btn':
      return BUTTONS.includes(m.b) && typeof m.down === 'boolean' ? { t: 'btn', b: m.b, down: m.down } : null;
    case 'menu':
      return ['back', 'off', 'leave'].includes(m.action) ? { t: 'menu', action: m.action } : null;
    case 'lang':
      return isLang(m.lang) ? { t: 'lang', lang: m.lang } : null;
    default:
      return null;
  }
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const onError = () => resolve(false);
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve(true);
    });
  });
}

/** HTTP for the phone page plus a WebSocket at /ws. */
export async function startServer(
  hub: PhoneHub,
  o: { webDir: string; port: number; maxPort: number; coversDir?: string; heartbeatMs?: number },
): Promise<{ port: number; close(): Promise<void> }> {
  const root = normalize(o.webDir + sep);
  const coversRoot = o.coversDir ? normalize(o.coversDir + sep) : null;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (path === '/') {
        res.writeHead(302, { location: '/phone/' }).end();
        return;
      }
      let base = root;
      if (path.startsWith('/covers/')) {
        if (!coversRoot) throw new Error('no covers');
        base = coversRoot;
        path = path.slice('/covers'.length);
      }
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(base, path));
      if (!file.startsWith(base)) throw new Error('outside web dir');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  let port = o.port;
  while (!(await listen(server, port))) {
    if (o.port === 0 || port >= o.maxPort) throw new Error(`No free port in ${o.port}-${o.maxPort}`);
    port++;
  }
  const sockets = new Map<WebSocket, string | null>();
  const tvs = new Set<WebSocket>();
  const sendTv = (ws: WebSocket) => ws.send(JSON.stringify({ t: 'tv', state: hub.tvState!() }));
  // Attached only after listen succeeds: ws re-emits server errors as its own.
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const send = (ws: WebSocket, token: string) => ws.send(JSON.stringify(hub.phoneState(token)));

  // Sockets replaced by a newer connection from the same phone: their close
  // must not mark the phone disconnected.
  const superseded = new WeakSet<WebSocket>();
  const alive = new WeakSet<WebSocket>();

  wss.on('connection', ws => {
    sockets.set(ws, null);
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    ws.on('message', data => {
      if (hub.tvState && String(data) === '{"t":"tv"}') {
        tvs.add(ws);
        sendTv(ws);
        return;
      }
      const msg = parseMsg(String(data));
      if (!msg) return;
      if (msg.t === 'lang' && tvs.has(ws)) return hub.setLang?.(msg.lang);
      let token = sockets.get(ws);
      if (msg.t === 'hello') {
        if (token && token !== msg.token) return;
        token = msg.token;
        sockets.set(ws, token);
        for (const [other, t] of sockets) {
          if (other !== ws && t === token) {
            superseded.add(other);
            sockets.delete(other);
            other.terminate();
          }
        }
      }
      if (!token) return;
      hub.phone(token, msg);
      if (msg.t === 'hello') send(ws, token);
    });
    ws.on('close', () => {
      tvs.delete(ws);
      const token = sockets.get(ws);
      sockets.delete(ws);
      if (token && !superseded.has(ws)) hub.disconnected(token);
    });
  });

  // A phone that vanishes from Wi-Fi never sends a close; notice it by pings
  // so its held buttons get released.
  const heartbeat = setInterval(() => {
    for (const ws of sockets.keys()) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, o.heartbeatMs ?? 2000);

  hub.onChange(() => {
    for (const [ws, token] of sockets) if (token && ws.readyState === ws.OPEN) send(ws, token);
    for (const ws of tvs) if (ws.readyState === ws.OPEN) sendTv(ws);
  });

  const actual = (server.address() as { port: number }).port;

  return {
    port: actual,
    close: () =>
      new Promise<void>(resolve => {
        clearInterval(heartbeat);
        for (const ws of sockets.keys()) ws.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
