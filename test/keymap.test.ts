import { keyFor, MAC_KEYCODES, pcsx2BindingName, BUTTONS, SLOTS } from '../src/shared/keymap.js';

test('spec key map', () => {
  expect(SLOTS.map(s => BUTTONS.map(b => keyFor(s, b)).join(''))).toEqual(['1QAZX', '2WSCV', '3EDBN', '4RFGH']);
});

test('all 20 keys distinct and have mac codes', () => {
  const keys = SLOTS.flatMap(s => BUTTONS.map(b => keyFor(s, b)));
  expect(new Set(keys).size).toBe(20);
  for (const k of keys) expect(typeof MAC_KEYCODES[k]).toBe('number');
  expect(MAC_KEYCODES['1']).toBe(0x12);
  expect(MAC_KEYCODES['Q']).toBe(0x0C);
  expect(MAC_KEYCODES['N']).toBe(0x2D);
});

test('pcsx2 binding names', () => {
  expect(pcsx2BindingName(1, 'red')).toBe('BuzzDevice_Red1');
  expect(pcsx2BindingName(4, 'yellow')).toBe('BuzzDevice_Yellow4');
});
