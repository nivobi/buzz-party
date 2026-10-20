import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECTOR = 2048;

function dirRecord(lba: number, size: number, name: Buffer, isDir: boolean): Buffer {
  const len = 33 + name.length + (name.length % 2 === 0 ? 1 : 0);
  const r = Buffer.alloc(len);
  r[0] = len;
  r.writeUInt32LE(lba, 2);
  r.writeUInt32BE(lba, 6);
  r.writeUInt32LE(size, 10);
  r.writeUInt32BE(size, 14);
  r[25] = isDir ? 2 : 0;
  r[32] = name.length;
  name.copy(r, 33);
  return r;
}

/** Minimal ISO9660 image: PVD at 16, terminator at 17, root dir at 18, files after. */
export function makeIso(files: Record<string, string>): Buffer {
  const names = Object.keys(files);
  const dataStart = 19;
  const img = Buffer.alloc((dataStart + names.length) * SECTOR);

  const pvd = img.subarray(16 * SECTOR);
  pvd[0] = 1;
  pvd.write('CD001', 1, 'latin1');
  pvd[6] = 1;
  dirRecord(18, SECTOR, Buffer.from([0]), true).copy(pvd, 156);

  const term = img.subarray(17 * SECTOR);
  term[0] = 255;
  term.write('CD001', 1, 'latin1');

  let off = 18 * SECTOR;
  for (const rec of [dirRecord(18, SECTOR, Buffer.from([0]), true), dirRecord(18, SECTOR, Buffer.from([1]), true)]) {
    rec.copy(img, off);
    off += rec.length;
  }
  names.forEach((n, i) => {
    const data = Buffer.from(files[n], 'latin1');
    data.copy(img, (dataStart + i) * SECTOR);
    const rec = dirRecord(dataStart + i, data.length, Buffer.from(`${n};1`, 'latin1'), false);
    rec.copy(img, off);
    off += rec.length;
  });
  return img;
}

export function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'buzz-test-'));
}

export function tmpFile(data: Buffer, name = 'disc.iso'): string {
  const p = join(tmpDir(), name);
  writeFileSync(p, data);
  return p;
}
