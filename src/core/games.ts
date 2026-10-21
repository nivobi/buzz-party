import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { readSerial } from './iso.js';
import { languagesFromName, titleFor } from './titles.js';

export interface Game {
  id: string;
  path: string;
  serial: string | null;
  title: string;
  /** From the file name's language list, e.g. `['Dansk', 'English']`. */
  languages: string[];
  /** URL of the cover image on the local server, once there is one. */
  cover?: string | null;
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
    if (e.name.startsWith('.') || !DISC_EXTS.has(ext)) continue;
    const path = join(dir, e.name);
    // Symlinks count if they point at a real file.
    if (!(await stat(path).then(st => st.isFile(), () => false))) continue;
    const serial = ext === '.iso' ? await readSerial(path) : null;
    games.push({ id: serial ?? e.name, path, serial, title: titleFor(serial, e.name), languages: languagesFromName(e.name) });
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}
