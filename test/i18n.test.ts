import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLang, loadDictionaries, translator } from '../src/core/i18n.js';
import { readSettings, writeSettings } from '../src/core/settings.js';
import { tmpDir } from './helpers/make-iso.js';

test('isLang accepts only known languages', () => {
  expect(isLang('da')).toBe(true);
  expect(isLang('en')).toBe(true);
  expect(isLang('xx')).toBe(false);
  expect(isLang(null)).toBe(false);
});

test('translator uses the language, falls back to English, then the key', () => {
  const t = translator({ en: { a: 'A {n}', only: 'EN only' }, da: { a: 'D {n}' } }, () => 'da');
  expect(t('a', { n: 2 })).toBe('D 2');
  expect(t('only')).toBe('EN only');
  expect(t('missing')).toBe('missing');
});

test('translator treats an unchosen language as English', () => {
  const t = translator({ en: { a: 'A' }, da: { a: 'D' } }, () => null);
  expect(t('a')).toBe('A');
});

test('the shipped language files have identical keys', () => {
  const d = loadDictionaries(join(__dirname, '..', 'web'));
  expect(Object.keys(d.en).length).toBeGreaterThan(20);
  expect(Object.keys(d.da).sort()).toEqual(Object.keys(d.en).sort());
});

test('missing language files load as empty', () => {
  const d = loadDictionaries(tmpDir());
  expect(d.en).toEqual({});
});

test('settings round trip, and bad files mean no settings', async () => {
  const dir = tmpDir();
  const file = join(dir, 'settings.json');
  expect(await readSettings(file)).toEqual({});
  await writeSettings(file, { language: 'da' });
  expect(await readSettings(file)).toEqual({ language: 'da' });
  mkdirSync(join(dir, 'x'));
  writeFileSync(file, '{not json');
  expect(await readSettings(file)).toEqual({});
  writeFileSync(file, JSON.stringify({ language: 'klingon' }));
  expect(await readSettings(file)).toEqual({});
});
