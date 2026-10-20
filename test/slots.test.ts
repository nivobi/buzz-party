import { SlotManager } from '../src/core/slots.js';

function make() {
  let t = 0;
  const m = new SlotManager({ now: () => t, releaseAfterMs: 90_000 });
  return { m, advance: (ms: number) => { t += ms; } };
}

test('claim a free slot, not someone else’s', () => {
  const { m } = make();
  expect(m.claim('a', 1)).toBe(true);
  expect(m.claim('b', 1)).toBe(false);
  expect(m.claim('a', 1)).toBe(true);
  expect(m.slotOf('a')).toBe(1);
});

test('claiming a new slot frees the old one', () => {
  const { m } = make();
  m.claim('a', 1);
  m.claim('a', 3);
  expect(m.slotOf('a')).toBe(3);
  expect(m.claim('b', 1)).toBe(true);
});

test('reconnect within the timeout keeps the slot', () => {
  const { m, advance } = make();
  m.claim('a', 2);
  m.disconnect('a');
  advance(89_999);
  expect(m.sweep()).toEqual([]);
  expect(m.connect('a')).toBe(2);
  advance(200_000);
  expect(m.sweep()).toEqual([]);
});

test('slot frees after 90 s disconnected', () => {
  const { m, advance } = make();
  m.claim('a', 2);
  m.disconnect('a');
  advance(90_000);
  expect(m.sweep()).toEqual([2]);
  expect(m.slotOf('a')).toBeNull();
  expect(m.connect('a')).toBeNull();
  expect(m.claim('b', 2)).toBe(true);
});

test('release frees the slot', () => {
  const { m } = make();
  m.claim('a', 4);
  m.release('a');
  expect(m.slotOf('a')).toBeNull();
});

test('view shows taken and connected flags', () => {
  const { m } = make();
  m.claim('a', 1);
  m.claim('b', 2);
  m.disconnect('b');
  expect(m.view()).toEqual([
    { slot: 1, taken: true, connected: true },
    { slot: 2, taken: true, connected: false },
    { slot: 3, taken: false, connected: false },
    { slot: 4, taken: false, connected: false },
  ]);
});
