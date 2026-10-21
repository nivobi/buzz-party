import { readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The community cover collection PCSX2's own "Download Covers" uses. */
export const COVER_URL = (serial: string) =>
  `https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default/${serial}.jpg`;

const COVER_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const SERIAL = /^[A-Z]{4}-\d{5}$/;

/** File name of a cover for this disc in `dir`, if there is one. */
export async function findCover(serial: string, dir: string): Promise<string | null> {
  const files = await readdir(dir).catch(() => [] as string[]);
  return files.find(f => COVER_EXTS.some(ext => f === `${serial}.${ext}`)) ?? null;
}

type FetchFn = (url: string) => Promise<Response>;

/** Downloads missing covers once per disc; never throws, never overwrites. */
export class CoverFetcher {
  private tried = new Set<string>();

  constructor(private o: { dir: string; fetch?: FetchFn }) {}

  /** True if a cover was downloaded just now. */
  async ensure(serial: string): Promise<boolean> {
    if (!SERIAL.test(serial) || this.tried.has(serial)) return false;
    this.tried.add(serial);
    if (await findCover(serial, this.o.dir)) return false;
    try {
      const res = await (this.o.fetch ?? fetch)(COVER_URL(serial));
      if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return false;
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length < 1024) return false;
      const file = join(this.o.dir, `${serial}.jpg`);
      await writeFile(`${file}.part`, body);
      await rename(`${file}.part`, file);
      return true;
    } catch {
      return false;
    }
  }
}
