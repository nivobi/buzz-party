import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CoverFetcher, COVER_URL, findCover } from '../src/core/covers.js';
import { tmpDir } from './helpers/make-iso.js';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000, 7)]);
function fakeFetch(status = 200, type = 'image/jpeg', body: Buffer = jpeg) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    return new Response(status === 200 ? body : 'nope', { status, headers: { 'content-type': type } });
  };
  return { fn, calls };
}

test('findCover finds the user’s own image in any common format', async () => {
  const dir = tmpDir();
  expect(await findCover('SCES-54703', dir)).toBeNull();
  writeFileSync(join(dir, 'SCES-54703.png'), 'x');
  expect(await findCover('SCES-54703', dir)).toBe('SCES-54703.png');
});

test('downloads a missing cover once, by serial', async () => {
  const dir = tmpDir();
  const f = fakeFetch();
  const covers = new CoverFetcher({ dir, fetch: f.fn });
  expect(await covers.ensure('SCES-54703')).toBe(true);
  expect(f.calls).toEqual([COVER_URL('SCES-54703')]);
  expect(readFileSync(join(dir, 'SCES-54703.jpg'))).toEqual(jpeg);
  expect(await covers.ensure('SCES-54703')).toBe(false);
  expect(f.calls).toHaveLength(1);
});

test('never overwrites the user’s own cover', async () => {
  const dir = tmpDir();
  writeFileSync(join(dir, 'SCES-54703.png'), 'mine');
  const f = fakeFetch();
  expect(await new CoverFetcher({ dir, fetch: f.fn }).ensure('SCES-54703')).toBe(false);
  expect(f.calls).toEqual([]);
});

test('a missing cover, a non-image or no internet: no file, no throw, no retry storm', async () => {
  const dir = tmpDir();
  const notFound = fakeFetch(404);
  const c1 = new CoverFetcher({ dir, fetch: notFound.fn });
  expect(await c1.ensure('SLUS-00001')).toBe(false);
  expect(await c1.ensure('SLUS-00001')).toBe(false);
  expect(notFound.calls).toHaveLength(1);

  const html = fakeFetch(200, 'text/html', Buffer.from('<html>'));
  expect(await new CoverFetcher({ dir, fetch: html.fn }).ensure('SLUS-00002')).toBe(false);

  const offline = new CoverFetcher({ dir, fetch: async () => { throw new Error('offline'); } });
  expect(await offline.ensure('SLUS-00003')).toBe(false);
  expect(['SLUS-00001', 'SLUS-00002', 'SLUS-00003'].some(s => existsSync(join(dir, `${s}.jpg`)))).toBe(false);
});

test('rejects serials that are not disc IDs (no path tricks)', async () => {
  const f = fakeFetch();
  expect(await new CoverFetcher({ dir: tmpDir(), fetch: f.fn }).ensure('../../etc')).toBe(false);
  expect(f.calls).toEqual([]);
});
