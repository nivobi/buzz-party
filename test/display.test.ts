import { chooseDisplay } from '../src/app/display.js';

const internal = { id: 1, internal: true, bounds: { x: 0, y: 0, width: 1512, height: 982 } };
const tv = { id: 2, internal: false, bounds: { x: 1512, y: 0, width: 1920, height: 1080 } };

test('extended desktop: the TV wins', () => {
  expect(chooseDisplay([internal, tv])).toEqual({ display: tv, external: true });
  expect(chooseDisplay([tv, internal])).toEqual({ display: tv, external: true });
});

test('one display (or mirrored): use it', () => {
  expect(chooseDisplay([internal])).toEqual({ display: internal, external: false });
  expect(chooseDisplay([tv])).toEqual({ display: tv, external: false });
});

test('setup, network and games are re-checked on every screen except during a game', async () => {
  const { shouldRecheck } = await import('../src/app/display.js');
  expect(['setup', 'picker', 'waiting'].map(m => shouldRecheck(m as never))).toEqual([true, true, true]);
  expect(['launching', 'game'].map(m => shouldRecheck(m as never))).toEqual([false, false]);
});
