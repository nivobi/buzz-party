import { titleFor } from '../src/core/titles.js';

test('a compressed disc image is named after the game, not the inner extension', () => {
  expect(titleFor(null, 'My Game (Europe) (En,Da).iso.gz')).toBe('My Game (Europe) (En,Da)');
  expect(titleFor(null, 'My Game.iso')).toBe('My Game');
  expect(titleFor(null, 'My Game.chd')).toBe('My Game');
});

test('a known serial still wins', () => {
  expect(titleFor('SCES-55210', 'whatever.iso.gz')).toBe('Buzz! Junior: Ace Racers');
});
