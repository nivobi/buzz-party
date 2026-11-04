import { readFile, writeFile } from 'node:fs/promises';
import { isLang, type Lang } from './i18n.js';

export interface Settings {
  /** Unset until the first-run language chooser has been answered. */
  language?: Lang;
}

/** Never throws: a missing or broken file means "no settings yet". */
export async function readSettings(file: string): Promise<Settings> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    return isLang(raw?.language) ? { language: raw.language } : {};
  } catch {
    return {};
  }
}

export async function writeSettings(file: string, s: Settings): Promise<void> {
  await writeFile(file, JSON.stringify(s, null, 2) + '\n');
}
