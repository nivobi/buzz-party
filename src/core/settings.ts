import { readFile, writeFile } from 'node:fs/promises';
import { isLang, type Lang } from './i18n.js';

export interface Settings {
  /** Unset until the first-run language chooser has been answered. */
  language?: Lang;
  /** UI sounds and the intro chime. Unset means on. */
  sound?: boolean;
  /** When the startup intro plays. Unset means always. */
  intro?: 'always' | 'boot' | 'never';
}

const INTRO_MODES = ['always', 'boot', 'never'] as const;

/** Never throws: a missing or broken file means "no settings yet". */
export async function readSettings(file: string): Promise<Settings> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    const out: Settings = {};
    if (isLang(raw?.language)) out.language = raw.language;
    if (typeof raw?.sound === 'boolean') out.sound = raw.sound;
    if (INTRO_MODES.includes(raw?.intro)) out.intro = raw.intro;
    return out;
  } catch {
    return {};
  }
}

export async function writeSettings(file: string, s: Settings): Promise<void> {
  await writeFile(file, JSON.stringify(s, null, 2) + '\n');
}

/** Changes some settings and keeps the others. Never throws. */
export async function updateSettings(file: string, patch: Settings): Promise<void> {
  try {
    await writeSettings(file, { ...(await readSettings(file)), ...patch });
  } catch {
    /* settings are a convenience; the app keeps working without them */
  }
}

/** A "cold boot" is an app start soon after the machine itself started. */
export const COLD_BOOT_SECONDS = 300;

export function shouldPlayIntro(mode: Settings['intro'], uptimeSeconds: number): boolean {
  if (mode === 'never') return false;
  if (mode === 'boot') return uptimeSeconds < COLD_BOOT_SECONDS;
  return true;
}
