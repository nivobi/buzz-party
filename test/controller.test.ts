import { Controller, type GameRunner } from '../src/app/controller.js';
import { FakeBridge } from '../src/bridge/fake.js';
import { Presser } from '../src/bridge/presser.js';
import type { Game } from '../src/core/games.js';
import { SlotManager } from '../src/core/slots.js';

const game = (title: string): Game => ({ id: title, path: `/g/${title}.iso`, serial: null, title });

class FakeRunner implements GameRunner {
  launched: Game[] = [];
  stops = 0;
  fail = false;
  private exitCb: (() => void) | null = null;
  async launch(g: Game) {
    if (this.fail) throw new Error('PCSX2 did not start');
    this.launched.push(g);
  }
  async stop() { this.stops++; this.exitCb?.(); }
  onExit(cb: () => void) { this.exitCb = cb; }
  crash() { this.exitCb?.(); }
}

function setup(games = [game('A'), game('B'), game('C')], problems: string[] = []) {
  let now = 0;
  const bridge = new FakeBridge();
  const presser = new Presser(bridge, { minHoldMs: 0 });
  const slots = new SlotManager({ now: () => now, releaseAfterMs: 90_000 });
  const runner = new FakeRunner();
  const quit = vi.fn();
  const c = new Controller({ slots, presser, runner, games, problems, join: { url: 'http://x', qr: 'data:qr' }, quit });
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
