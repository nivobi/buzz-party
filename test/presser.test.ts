import { FakeBridge } from '../src/bridge/fake.js';
import { Presser } from '../src/bridge/presser.js';

let bridge: FakeBridge;
let p: Presser;
beforeEach(() => {
  vi.useFakeTimers();
  bridge = new FakeBridge();
  p = new Presser(bridge, { minHoldMs: 50 });
});
afterEach(() => vi.useRealTimers());

test('press and release', () => {
  p.press(1, 'red');
  vi.advanceTimersByTime(200);
  p.release(1, 'red');
  expect(bridge.events).toEqual(['down:1', 'up:1']);
});

test('a quick tap is held for at least 50 ms', () => {
  p.press(1, 'blue');
  vi.advanceTimersByTime(5);
  p.release(1, 'blue');
  expect(bridge.events).toEqual(['down:Q']);
  vi.advanceTimersByTime(44);
  expect(bridge.events).toEqual(['down:Q']);
  vi.advanceTimersByTime(1);
  expect(bridge.events).toEqual(['down:Q', 'up:Q']);
});

test('two players at once are independent', () => {
  p.press(1, 'red');
  p.press(2, 'red');
  vi.advanceTimersByTime(100);
  p.release(1, 'red');
  expect(bridge.events).toEqual(['down:1', 'down:2', 'up:1']);
});

test('two fingers on one phone are independent', () => {
  p.press(3, 'blue');
  p.press(3, 'green');
  vi.advanceTimersByTime(100);
  p.release(3, 'blue');
  expect(bridge.events).toEqual(['down:E', 'down:B', 'up:E']);
});

test('pressing a held key again sends nothing', () => {
  p.press(1, 'red');
  p.press(1, 'red');
  expect(bridge.events).toEqual(['down:1']);
});

test('release of a key that is not held does nothing', () => {
  p.release(1, 'red');
  expect(bridge.events).toEqual([]);
});

test('press again during a pending early release keeps it held', () => {
  p.press(1, 'red');
  vi.advanceTimersByTime(10);
  p.release(1, 'red');
  p.press(1, 'red');
  vi.advanceTimersByTime(100);
  expect(bridge.events).toEqual(['down:1']);
});

test('releaseAll(slot) releases only that player, at once', () => {
  p.press(1, 'red');
  p.press(1, 'yellow');
  p.press(2, 'green');
  p.releaseAll(1);
  expect(bridge.events).toEqual(['down:1', 'down:X', 'down:C', 'up:1', 'up:X']);
});

test('releaseAll() releases everything', () => {
  p.press(1, 'red');
  p.press(4, 'orange');
  p.releaseAll();
  expect(bridge.events.slice(2).sort()).toEqual(['up:1', 'up:F']);
  vi.advanceTimersByTime(100);
  expect(bridge.events).toHaveLength(4);
});
