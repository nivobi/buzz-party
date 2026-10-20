import { paths, pickBios } from '../src/core/paths.js';

test('prefers the SCPH-70004 BIOS', () => {
  expect(pickBios(['SCPH-30003.BIN', 'SCPH-70004_BIOS_V12_EUR_200.BIN', 'x.NVM'])).toBe('SCPH-70004_BIOS_V12_EUR_200.BIN');
});

test('otherwise the first .bin alphabetically, case-insensitive', () => {
  expect(pickBios(['b.bin', 'A.BIN', 'c.txt'])).toBe('A.BIN');
});

test('null when there is no BIOS', () => {
  expect(pickBios(['a.txt', 'b.NVM'])).toBeNull();
});

test('folders live under ~/BuzzParty', () => {
  expect(paths('/Users/x')).toEqual({
    root: '/Users/x/BuzzParty',
    games: '/Users/x/BuzzParty/Games',
    bios: '/Users/x/BuzzParty/BIOS',
    covers: '/Users/x/BuzzParty/Covers',
    pcsx2Data: '/Users/x/BuzzParty/.pcsx2',
  });
});
