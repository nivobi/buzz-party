import { open } from 'node:fs/promises';

const SECTOR = 2048;

/** `BOOT2 = cdrom0:\SCUS_975.97;1` → `SCUS-97597`. */
export function parseBoot2(systemCnf: string): string | null {
  const m = /BOOT2\s*=\s*cdrom0:\\+([A-Z]{4})_(\d{3})\.(\d{2})/i.exec(systemCnf);
  return m ? `${m[1].toUpperCase()}-${m[2]}${m[3]}` : null;
}

/** Reads the PS2 disc serial from SYSTEM.CNF in an ISO9660 image, or null. */
export async function readSerial(isoPath: string): Promise<string | null> {
  let fh;
  try {
    fh = await open(isoPath, 'r');
    const { size } = await fh.stat();
    const read = async (pos: number, len: number): Promise<Buffer> => {
      if (pos < 0 || len <= 0 || pos + len > size) throw new Error('out of range');
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh!.read(buf, 0, len, pos);
      if (bytesRead !== len) throw new Error('short read');
      return buf;
    };

    const pvd = await read(16 * SECTOR, SECTOR);
    if (pvd[0] !== 1 || pvd.toString('latin1', 1, 6) !== 'CD001') return null;
    const rootLba = pvd.readUInt32LE(156 + 2);
    const rootSize = pvd.readUInt32LE(156 + 10);
    if (rootSize > 1024 * 1024) return null;

    const dir = await read(rootLba * SECTOR, rootSize);
    let off = 0;
    while (off < dir.length) {
      const len = dir[off];
      if (len === 0) {
        // Records never cross sector boundaries; skip to the next sector.
        off = (Math.floor(off / SECTOR) + 1) * SECTOR;
        continue;
      }
      const nameLen = dir[off + 32];
      const name = dir.toString('latin1', off + 33, off + 33 + nameLen).toUpperCase();
      if (name === 'SYSTEM.CNF;1' || name === 'SYSTEM.CNF') {
        const lba = dir.readUInt32LE(off + 2);
        const fileSize = Math.min(dir.readUInt32LE(off + 10), 4096);
        const cnf = await read(lba * SECTOR, fileSize);
        return parseBoot2(cnf.toString('latin1'));
      }
      off += len;
    }
    return null;
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}
