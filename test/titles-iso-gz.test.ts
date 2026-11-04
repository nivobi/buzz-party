import { titleFor } from '../src/core/titles.js';

test('a compressed disc image is named after the game, not the inner extension', () => {
  expect(titleFor(null, 'My Game (Europe) (En,Da).iso.gz')).toBe('My Game (Europe) (En,Da)');
  expect(titleFor(null, 'My Game.iso')).toBe('My Game');
  expect(titleFor(null, 'My Game.chd')).toBe('My Game');
});

test('a known serial still wins', () => {
  expect(titleFor('SCES-55210', 'whatever.iso.gz')).toBe('Buzz! Junior: Ace Racers');
});

test('the quiz games and regional editions have proper names', () => {
  expect(titleFor('SCES-53304', 'x.iso')).toBe('Buzz! The Music Quiz');
  expect(titleFor('SCUS-97592', 'x.iso')).toBe('Buzz! The Mega Quiz');
  expect(titleFor('SCES-53883', 'x.iso')).toBe('Buzz! Das große Quiz');
  expect(titleFor('SCES-55385', 'x.iso')).toBe('Buzz! Brain of the UK');
});

test('Junior names written differently in PCSX2\'s database are tidied', () => {
  expect(titleFor('SCUS-97596', 'x.iso')).toBe('Buzz! Junior: Jungle Party');
  expect(titleFor('SCUS-97602', 'x.iso')).toBe('Buzz! Junior: Jungle Party');
  expect(titleFor('SCUS-97634', 'x.iso')).toBe('Buzz! Junior: RoboJam');
});

test('a disc that is not in the list is shown under its file name', () => {
  expect(titleFor('SLES-53236', 'Some Other Game.iso')).toBe('Some Other Game');
});
