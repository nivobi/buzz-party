import '../web/phone/keep-awake.js';

// Phones went to sleep mid-game (iPhone, 2026-11-08): navigator.wakeLock only
// exists on HTTPS/localhost, and the buzzer page is plain http on the LAN.
// The fallback is a tiny muted video looping inline, started on a tap.

type KeepAwakeApi = {
  create(env: { document: unknown; navigator: unknown; secure: boolean }): {
    start(): Promise<void>;
    resume(): Promise<void>;
    readonly method: 'wakelock' | 'video' | null;
  };
};
const api = (globalThis as unknown as { BuzzKeepAwake: KeepAwakeApi }).BuzzKeepAwake;

function fakeEnv(o: { secure: boolean; wakeLock?: 'ok' | 'refuse' }) {
  const videos: { attrs: Record<string, string>; src: string; plays: number; muted?: boolean; style: Record<string, string> }[] = [];
  const document = {
    createElement(tag: string) {
      expect(tag).toBe('video');
      const v = {
        attrs: {} as Record<string, string>, src: '', plays: 0, style: {} as Record<string, string>,
        setAttribute(k: string, val: string) { this.attrs[k] = val; },
        play() { this.plays++; return Promise.resolve(); },
      };
      videos.push(v);
      return v;
    },
    body: { append: vi.fn() },
  };
  const requests: string[] = [];
  const navigator = o.wakeLock
    ? { wakeLock: { request: async (t: string) => { requests.push(t); if (o.wakeLock === 'refuse') throw new Error('NotAllowedError'); return {}; } } }
    : {};
  return { env: { document, navigator, secure: o.secure }, videos, requests, body: document.body };
}

test('plain http (the box): first tap starts a muted, inline, looping video', async () => {
  const f = fakeEnv({ secure: false });
  const ka = api.create(f.env);
  await ka.start();
  expect(ka.method).toBe('video');
  expect(f.videos).toHaveLength(1);
  const v = f.videos[0];
  expect(v.attrs).toMatchObject({ muted: '', playsinline: '', loop: '' });
  expect(v.src).toMatch(/^data:video\/mp4;base64,/);
  expect(v.plays).toBe(1);
  expect(f.body.append).toHaveBeenCalledOnce();
});

test('https or localhost with wakeLock: uses it, no video', async () => {
  const f = fakeEnv({ secure: true, wakeLock: 'ok' });
  const ka = api.create(f.env);
  await ka.start();
  expect(ka.method).toBe('wakelock');
  expect(f.requests).toEqual(['screen']);
  expect(f.videos).toHaveLength(0);
});

test('a refused wakeLock falls back to the video', async () => {
  const f = fakeEnv({ secure: true, wakeLock: 'refuse' });
  const ka = api.create(f.env);
  await ka.start();
  expect(ka.method).toBe('video');
  expect(f.videos[0].plays).toBe(1);
});

test('coming back to the page starts it again (the phone pauses it while away)', async () => {
  const f = fakeEnv({ secure: false });
  const ka = api.create(f.env);
  await ka.start();
  await ka.resume();
  expect(f.videos).toHaveLength(1);
  expect(f.videos[0].plays).toBe(2);
  const g = fakeEnv({ secure: true, wakeLock: 'ok' });
  const kb = api.create(g.env);
  await kb.start();
  await kb.resume();
  expect(g.requests).toEqual(['screen', 'screen']);
});

test('before the first tap, resume does not start a video (phones block it)', async () => {
  const f = fakeEnv({ secure: false });
  const ka = api.create(f.env);
  await ka.resume();
  expect(f.videos).toHaveLength(0);
  expect(ka.method).toBeNull();
});

test('more taps do not add more videos', async () => {
  const f = fakeEnv({ secure: false });
  const ka = api.create(f.env);
  await ka.start();
  await ka.start();
  expect(f.videos).toHaveLength(1);
});
