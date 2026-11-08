import { Controller, type ControllerDeps, type GameRunner } from '../src/app/controller.js';
import { FakeBridge } from '../src/bridge/fake.js';
import { Presser } from '../src/bridge/presser.js';
import type { Game } from '../src/core/games.js';
import { SlotManager } from '../src/core/slots.js';

const game = (title: string): Game => ({ id: title, path: `/g/${title}.iso`, serial: null, title, languages: [] });

class FakeRunner implements GameRunner {
  launched: Game[] = [];
  stops = 0;
  fail = false;
  cancel = false;
  private exitCb: (() => void) | null = null;
  async launch(g: Game) {
    if (this.fail) throw new Error('PCSX2 did not start');
    if (this.cancel) throw Object.assign(new Error('Stopped before the game started'), { name: 'LaunchCancelled' });
    this.launched.push(g);
  }
  async stop() { this.stops++; this.exitCb?.(); }
  onExit(cb: () => void) { this.exitCb = cb; }
  crash() { this.exitCb?.(); }
}

function setup(games = [game('A'), game('B'), game('C')], problems: string[] = [], extra: Partial<ControllerDeps> = {}) {
  let now = 0;
  const bridge = new FakeBridge();
  const presser = new Presser(bridge, { minHoldMs: 0 });
  const slots = new SlotManager({ now: () => now, releaseAfterMs: 90_000 });
  const runner = new FakeRunner();
  const quit = vi.fn();
  const c = new Controller({ slots, presser, runner, games, problems, join: { url: 'http://x', qr: 'data:qr' }, quit, ...extra });
  const changes = vi.fn();
  c.onChange(changes);
  const join = (token: string, slot: 1 | 2 | 3 | 4) => {
    c.phone(token, { t: 'hello', token });
    c.phone(token, { t: 'claim', slot });
  };
  const press = (token: string, b: 'red' | 'blue' | 'orange' | 'green' | 'yellow') => {
    c.phone(token, { t: 'btn', b, down: true });
    c.phone(token, { t: 'btn', b, down: false });
  };
  const flush = () => new Promise(r => setTimeout(r, 0));
  return { c, bridge, runner, quit, changes, join, press, flush, advance: (ms: number) => { now += ms; } };
}

test('picker: orange/blue move with wrap, red launches', async () => {
  const s = setup();
  s.join('p', 1);
  expect(s.c.tvState().mode).toBe('picker');
  s.press('p', 'orange');
  expect(s.c.tvState().selected).toBe(1);
  s.press('p', 'blue');
  s.press('p', 'blue');
  expect(s.c.tvState().selected).toBe(2);
  s.press('p', 'red');
  expect(s.c.tvState().mode).toBe('launching');
  await s.flush();
  expect(s.runner.launched.map(g => g.title)).toEqual(['C']);
  expect(s.c.tvState().mode).toBe('game');
  expect(s.c.tvState().gameTitle).toBe('C');
});

test('a phone without a slot is ignored', () => {
  const s = setup();
  s.c.phone('x', { t: 'hello', token: 'x' });
  s.press('x', 'orange');
  expect(s.c.tvState().selected).toBe(0);
});

test('waiting: only red from a joined player starts the single game', async () => {
  const s = setup([game('Solo')]);
  expect(s.c.tvState().mode).toBe('waiting');
  s.join('p', 2);
  s.press('p', 'orange');
  expect(s.c.tvState().mode).toBe('waiting');
  s.press('p', 'red');
  await s.flush();
  expect(s.runner.launched.map(g => g.title)).toEqual(['Solo']);
});

test('setup mode when there are problems, buttons do nothing', async () => {
  const s = setup([], ['Put your games in ~/BuzzParty/Games']);
  s.join('p', 1);
  s.press('p', 'red');
  await s.flush();
  expect(s.c.tvState().mode).toBe('setup');
  expect(s.runner.launched).toEqual([]);
});

async function inGame() {
  const s = setup();
  s.join('p', 1);
  s.join('q', 2);
  s.press('p', 'red');
  await s.flush();
  s.bridge.events = [];
  return s;
}

test('in game, buttons become key presses', async () => {
  const s = await inGame();
  s.c.phone('q', { t: 'btn', b: 'green', down: true });
  s.c.phone('q', { t: 'btn', b: 'green', down: false });
  expect(s.bridge.events).toEqual(['down:C', 'up:C']);
});

test('a phone dropping mid-press releases its keys', async () => {
  const s = await inGame();
  s.c.phone('p', { t: 'btn', b: 'red', down: true });
  s.c.phone('q', { t: 'btn', b: 'blue', down: true });
  s.c.disconnected('p');
  expect(s.bridge.events).toEqual(['down:1', 'down:W', 'up:1']);
  expect(s.c.phoneState('q').slots[0]).toEqual({ slot: 1, taken: true, connected: false });
});

test('back to games stops PCSX2 and releases everything', async () => {
  const s = await inGame();
  s.c.phone('q', { t: 'btn', b: 'blue', down: true });
  s.c.phone('p', { t: 'menu', action: 'back' });
  await s.flush();
  expect(s.runner.stops).toBe(1);
  expect(s.bridge.events).toContain('up:W');
  expect(s.c.tvState().mode).toBe('picker');
  expect(s.c.tvState().gameTitle).toBeNull();
});

test('PCSX2 exiting on its own returns to the picker', async () => {
  const s = await inGame();
  s.c.phone('p', { t: 'btn', b: 'yellow', down: true });
  s.runner.crash();
  expect(s.c.tvState().mode).toBe('picker');
  expect(s.bridge.events).toEqual(['down:X', 'up:X']);
});

test('a failed launch returns home with the error shown', async () => {
  const s = setup();
  s.runner.fail = true;
  s.join('p', 1);
  s.press('p', 'red');
  await s.flush();
  expect(s.c.tvState().mode).toBe('picker');
  expect(s.c.tvState().problems).toEqual(['Couldn’t start the game: PCSX2 did not start']);
});

test('turn off works on the picker but not in a game', async () => {
  const s = setup();
  s.join('p', 1);
  s.press('p', 'red');
  await s.flush();
  s.c.phone('p', { t: 'menu', action: 'off' });
  expect(s.quit).not.toHaveBeenCalled();
  s.c.phone('p', { t: 'menu', action: 'back' });
  await s.flush();
  s.c.phone('p', { t: 'menu', action: 'off' });
  expect(s.quit).toHaveBeenCalledOnce();
});

test('leave frees the slot', () => {
  const s = setup();
  s.join('p', 3);
  s.c.phone('p', { t: 'menu', action: 'leave' });
  expect(s.c.phoneState('p').you).toBeNull();
});

test('phoneState carries mode, slot, join info', () => {
  const s = setup();
  s.join('p', 4);
  expect(s.c.phoneState('p')).toMatchObject({ t: 'state', mode: 'picker', you: 4, joinUrl: 'http://x', qr: 'data:qr' });
});

test('state changes notify listeners', () => {
  const s = setup();
  s.join('p', 1);
  const before = s.changes.mock.calls.length;
  s.press('p', 'orange');
  expect(s.changes.mock.calls.length).toBeGreaterThan(before);
});

test('tick frees timed-out slots and notifies', () => {
  const s = setup();
  s.join('p', 1);
  s.c.disconnected('p');
  s.advance(90_000);
  s.changes.mockClear();
  s.c.tick();
  expect(s.changes).toHaveBeenCalled();
  expect(s.c.tvState().slots[0].taken).toBe(false);
});

test('update replaces games and problems', () => {
  const s = setup([], ['no games']);
  s.c.update({ games: [game('X'), game('Y')], problems: [] });
  expect(s.c.tvState().mode).toBe('picker');
  expect(s.c.tvState().games).toHaveLength(2);
});

test('a phone saying hello again releases keys its old connection left down', async () => {
  const s = await inGame();
  s.c.phone('p', { t: 'btn', b: 'red', down: true });
  s.c.phone('p', { t: 'hello', token: 'p' });
  expect(s.bridge.events).toEqual(['down:1', 'up:1']);
});

test('a cancelled launch goes home quietly, without an error', async () => {
  const s = setup();
  s.runner.cancel = true;
  s.join('p', 1);
  s.press('p', 'red');
  await s.flush();
  expect(s.c.tvState().mode).toBe('picker');
  expect(s.c.tvState().problems).toEqual([]);
});

test('phones see the name of the selected game', () => {
  const s = setup();
  s.join('p', 1);
  expect(s.c.phoneState('p').selectedTitle).toBe('A');
  s.press('p', 'orange');
  expect(s.c.phoneState('p').selectedTitle).toBe('B');
  const solo = setup([game('Solo')]);
  expect(solo.c.phoneState('x').selectedTitle).toBe('Solo');
  const none = setup([], ['no games']);
  expect(none.c.phoneState('x').selectedTitle).toBeNull();
});

describe('language', () => {
  const make = (lang: string | null | undefined) => {
    const setLang = vi.fn();
    const t = (key: string, p?: Record<string, string | number>) => `t:${key}:${p?.message ?? ''}`;
    const runner = new FakeRunner();
    const c = new Controller({
      slots: new SlotManager({ now: () => 0, releaseAfterMs: 90_000 }),
      presser: new Presser(new FakeBridge(), { minHoldMs: 0 }),
      runner, games: [game('A'), game('B')], problems: [], join: null, quit: vi.fn(), lang, setLang, t,
    });
    return { c, setLang, runner };
  };

  test('reports the language to the TV and phones; undefined counts as English', () => {
    expect(make('da').c.tvState().lang).toBe('da');
    expect(make(null).c.tvState().lang).toBeNull();
    expect(make(undefined).c.phoneState('x').lang).toBe('en');
  });

  test('a phone choosing a language is passed to the owner of the setting', () => {
    const { c, setLang } = make(null);
    c.phone('p', { t: 'hello', token: 'p' });
    c.phone('p', { t: 'lang', lang: 'da' });
    expect(setLang).toHaveBeenCalledWith('da');
  });

  test('update() can set the language', () => {
    const { c } = make(null);
    c.update({ lang: 'da' });
    expect(c.tvState().lang).toBe('da');
  });

  test('launch errors use the translator', async () => {
    const { c, runner } = make('da');
    runner.fail = true;
    c.phone('p', { t: 'hello', token: 'p' });
    c.phone('p', { t: 'claim', slot: 1 });
    c.phone('p', { t: 'btn', b: 'red', down: true });
    await vi.waitFor(() => expect(c.tvState().problems).toContain('t:error.launch:PCSX2 did not start'));
  });
});

test('the TV is told which OS the app runs on', () => {
  const mk = (platform?: string) => new Controller({
    slots: new SlotManager({ now: () => 0, releaseAfterMs: 90_000 }),
    presser: new Presser(new FakeBridge(), { minHoldMs: 0 }),
    runner: new FakeRunner(), games: [game('A')], problems: [], join: null, quit: vi.fn(), platform,
  });
  expect(mk('linux').tvState().platform).toBe('linux');
  expect(mk().tvState().platform).toBe(process.platform);
});

describe('sound setting', () => {
  const mk = (sound?: boolean) => {
    const setSound = vi.fn();
    const c = new Controller({
      slots: new SlotManager({ now: () => 0, releaseAfterMs: 90_000 }),
      presser: new Presser(new FakeBridge(), { minHoldMs: 0 }),
      runner: new FakeRunner(), games: [game('A')], problems: [], join: null, quit: vi.fn(), sound, setSound,
    });
    return { c, setSound };
  };

  test('is on unless the owner says otherwise, for the TV and phones', () => {
    expect(mk().c.tvState().sound).toBe(true);
    expect(mk(false).c.tvState().sound).toBe(false);
    expect(mk(false).c.phoneState('x').sound).toBe(false);
  });

  test('a phone switching it is passed on, and update() changes what everyone sees', () => {
    const { c, setSound } = mk(true);
    c.phone('p', { t: 'hello', token: 'p' });
    c.phone('p', { t: 'sound', on: false });
    expect(setSound).toHaveBeenCalledWith(false);
    c.update({ sound: false });
    expect(c.tvState().sound).toBe(false);
  });
});

describe('buzzer lights', () => {
  test('in game, lightOf follows the slot', async () => {
    const s = await inGame(); // p = slot 1, q = slot 2
    const lit = vi.fn();
    s.c.onLights(lit);
    s.c.setLights([true, false, false, false]);
    expect(s.c.lightOf('p')).toBe(true);
    expect(s.c.lightOf('q')).toBe(false);
    expect(s.c.lightOf('nobody')).toBe(false);
    expect(lit).toHaveBeenCalledTimes(1);
  });

  test('same lights again do not notify', async () => {
    const s = await inGame();
    const lit = vi.fn();
    s.c.onLights(lit);
    s.c.setLights([false, true, false, false]);
    s.c.setLights([false, true, false, false]);
    expect(lit).toHaveBeenCalledTimes(1);
  });

  test('lightOf follows the slot', async () => {
    const s = await inGame();
    s.c.setLights([false, false, true, false]);
    expect(s.c.lightOf('p')).toBe(false);
    s.c.phone('p', { t: 'menu', action: 'leave' });
    s.c.phone('p', { t: 'claim', slot: 3 });
    expect(s.c.lightOf('p')).toBe(true);
  });

  test('game end turns all lights off', async () => {
    const s = await inGame();
    s.c.setLights([true, true, false, false]);
    const lit = vi.fn();
    s.c.onLights(lit);
    s.runner.crash();
    expect(s.c.lightOf('p')).toBe(false);
    expect(s.c.lightOf('q')).toBe(false);
    expect(lit).toHaveBeenCalledTimes(1);
  });

  test('lights arriving outside a game are ignored', async () => {
    const s = await inGame();
    s.runner.crash();
    const lit = vi.fn();
    s.c.onLights(lit);
    s.c.setLights([true, true, true, true]);
    expect(s.c.lightOf('p')).toBe(false);
    expect(lit).not.toHaveBeenCalled();
  });

  test('lightsAnyMode accepts lights in the picker', () => {
    const s = setup(undefined, [], { lightsAnyMode: true });
    s.join('p', 1);
    s.c.setLights([true, false, false, false]);
    expect(s.c.lightOf('p')).toBe(true);
  });
});

const hotspot = { mode: 'hotspot' as const, ssid: null, error: null, hotspotSsid: 'BuzzParty-Setup' };

test('wifi view puts the TV in wifi mode', () => {
  const s = setup();
  expect(s.c.tvState().wifi).toBeNull();
  s.c.update({ wifi: hotspot });
  expect(s.c.tvState().mode).toBe('wifi');
  expect(s.c.tvState().wifi).toEqual(hotspot);
  s.c.update({ wifi: null });
  expect(s.c.tvState().mode).toBe('picker');
});

test('wifi comes before setup problems', () => {
  const s = setup([game('A')], ['No PCSX2']);
  expect(s.c.tvState().mode).toBe('setup');
  s.c.update({ wifi: hotspot });
  expect(s.c.tvState().mode).toBe('wifi');
});

test('wifi from the start', () => {
  const s = setup(undefined, [], { wifi: hotspot });
  expect(s.c.tvState().mode).toBe('wifi');
});

test('wifi never interrupts a game', async () => {
  const s = setup();
  s.join('p', 1);
  s.press('p', 'red');
  await s.flush();
  expect(s.c.tvState().mode).toBe('game');
  s.c.update({ wifi: hotspot });
  expect(s.c.tvState().mode).toBe('game');
  s.runner.crash();
  expect(s.c.tvState().mode).toBe('wifi');
});

test('buttons do not launch a game from the wifi screen', async () => {
  const s = setup();
  s.join('p', 1);
  s.c.update({ wifi: hotspot });
  s.press('p', 'red');
  await s.flush();
  expect(s.runner.launched).toEqual([]);
  expect(s.c.tvState().mode).toBe('wifi');
});
