import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { readSerial } from './iso.js';
import { titleFor } from './titles.js';

export interface Game {
  id: string;
  path: string;
  serial: string | null;
  title: string;
}

const DISC_EXTS = new Set(['.iso', '.chd', '.cso', '.bin', '.gz']);

/** Top-level disc images in `dir`, sorted by title. Never throws. */
export async function scanGames(dir: string): Promise<Game[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const games: Game[] = [];
  for (const e of entries) {
    const ext = extname(e.name).toLowerCase();
    if (!e.isFile() || e.name.startsWith('.') || !DISC_EXTS.has(ext)) continue;
    const path = join(dir, e.name);
    const serial = ext === '.iso' ? await readSerial(path) : null;
    games.push({ id: serial ?? e.name, path, serial, title: titleFor(serial, e.name) });
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}
