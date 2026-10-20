import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BuzzPaths {
  root: string;
  games: string;
  bios: string;
  covers: string;
  pcsx2Data: string;
}

export function paths(home = homedir()): BuzzPaths {
  const root = join(home, 'BuzzParty');
  return {
    root,
    games: join(root, 'Games'),
    bios: join(root, 'BIOS'),
    covers: join(root, 'Covers'),
    pcsx2Data: join(root, '.pcsx2'),
  };
}

export async function ensureFolders(p: BuzzPaths = paths()): Promise<void> {
  for (const dir of [p.games, p.bios, p.covers, join(p.pcsx2Data, 'inis')]) {
    await mkdir(dir, { recursive: true });
  }
}

/** The SCPH-70004 BIOS if present, else the first .bin alphabetically. */
export function pickBios(files: string[]): string | null {
  const bins = files.filter(f => f.toLowerCase().endsWith('.bin')).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return bins.find(f => f.includes('SCPH-70004')) ?? bins[0] ?? null;
}
