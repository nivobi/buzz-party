import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanGames } from '../src/core/games.js';
import { titleFor } from '../src/core/titles.js';
import { makeIso, tmpDir } from './helpers/make-iso.js';

test('scanGames skips junk and falls back to the file name', async () => {
  const dir = tmpDir();
  writeFileSync(join(dir, 'RoboJam.iso'), makeIso({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SCUS_975.97;1\n' }));
  writeFileSync(join(dir, 'notes.txt'), 'hello');
  writeFileSync(join(dir, 'broken.iso'), 'not an iso');
  writeFileSync(join(dir, 'Other.chd'), 'chd');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, '.hidden.iso'), 'x');

  const games = await scanGames(dir);
  expect(games.map(g => [g.title, g.serial])).toEqual([
    ['broken', null],
    ['Buzz! Junior: RoboJam', 'SCUS-97597'],
    ['Other', null],
  ]);
  expect(games[1].id).toBe('SCUS-97597');
  expect(games[0].id).toBe('broken.iso');
});

test('scanGames on a missing folder returns no games', async () => {
  expect(await scanGames(join(tmpDir(), 'nope'))).toEqual([]);
});

test('titleFor knows every region and falls back to the file name', () => {
  expect(titleFor('SCES-54676', 'x.iso')).toBe('Buzz! Junior: RoboJam');
  expect(titleFor('SCUS-97596', 'x.iso')).toBe('Buzz! Junior: Jungle Party');
  expect(titleFor('SCES-54749', 'x.iso')).toBe('Buzz! Junior: Dino Den');
  expect(titleFor('SLUS-00001', 'My Game.iso')).toBe('My Game');
  expect(titleFor(null, 'Thing.chd')).toBe('Thing');
});

test('scanGames follows symlinks to disc images', async () => {
  const { symlinkSync } = await import('node:fs');
  const src = tmpDir();
  writeFileSync(join(src, 'real.iso'), makeIso({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SCUS_975.97;1\n' }));
  const dir = tmpDir();
  symlinkSync(join(src, 'real.iso'), join(dir, 'Linked.iso'));
  symlinkSync(join(src, 'missing.iso'), join(dir, 'Dangling.iso'));
  const games = await scanGames(dir);
  expect(games.map(g => g.serial)).toEqual(['SCUS-97597']);
});

test('languagesFromName reads the No-Intro language list, Danish first', async () => {
  const { languagesFromName } = await import('../src/core/titles.js');
  expect(languagesFromName('Buzz! Junior - Monster Rumble (Europe) (En,Sv,No,Da,Fi,El,Pl,Ru,Cs).iso'))
    .toEqual(['Dansk', 'English', 'Svenska', 'Norsk', 'Suomi', 'Ελληνικά', 'Polski', 'Русский', 'Čeština']);
  expect(languagesFromName('Buzz! Junior - RoboJam (USA) (En,Fr,Es).iso')).toEqual(['English', 'Français', 'Español']);
  expect(languagesFromName('RoboJam.iso')).toEqual([]);
  expect(languagesFromName('Game (Europe) (Xx,En).iso')).toEqual(['English']);
});

test('scanGames attaches languages', async () => {
  const dir = tmpDir();
  writeFileSync(join(dir, 'Buzz (Europe) (En,Da).iso'), makeIso({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SCES_547.03;1\n' }));
  const [g] = await scanGames(dir);
  expect(g.languages).toEqual(['Dansk', 'English']);
});
