import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { BUTTONS, SLOTS } from '../shared/keymap.js';
import type { PhoneMsg, PhoneState } from '../shared/protocol.js';

/** The part of the Controller the server talks to. */
export interface PhoneHub {
  phone(token: string, msg: PhoneMsg): void;
  disconnected(token: string): void;
  phoneState(token: string): PhoneState;
  onChange(cb: () => void): void;
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
  o: { webDir: string; port: number; maxPort: number },
): Promise<{ port: number; close(): Promise<void> }> {
  const root = normalize(o.webDir + sep);
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) throw new Error('outside web dir');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
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
  // Attached only after listen succeeds: ws re-emits server errors as its own.
  const wss = new WebSocketServer({ server, path: '/ws' });
  const send = (ws: WebSocket, token: string) => ws.send(JSON.stringify(hub.phoneState(token)));

  wss.on('connection', ws => {
    sockets.set(ws, null);
    ws.on('message', data => {
      const msg = parseMsg(String(data));
      if (!msg) return;
      let token = sockets.get(ws);
      if (msg.t === 'hello') {
        token = msg.token;
        sockets.set(ws, token);
      }
      if (!token) return;
      hub.phone(token, msg);
      if (msg.t === 'hello') send(ws, token);
    });
    ws.on('close', () => {
      const token = sockets.get(ws);
      sockets.delete(ws);
      if (token) hub.disconnected(token);
    });
  });

  hub.onChange(() => {
    for (const [ws, token] of sockets) if (token && ws.readyState === ws.OPEN) send(ws, token);
  });

  const actual = (server.address() as { port: number }).port;

  return {
    port: actual,
    close: () =>
      new Promise<void>(resolve => {
        for (const ws of sockets.keys()) ws.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
