import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Languages the UI can show. Keep in sync with LANGS in web/i18n.js. */
export const LANGS = ['en', 'da'] as const;
export type Lang = (typeof LANGS)[number];

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

export type Dictionary = Record<string, string>;
export type Params = Record<string, string | number>;

/** Reads web/i18n/<lang>.json for every language. Missing files give an empty dictionary. */
export function loadDictionaries(webDir: string): Record<Lang, Dictionary> {
  const out = {} as Record<Lang, Dictionary>;
  for (const lang of LANGS) {
    try {
      out[lang] = JSON.parse(readFileSync(join(webDir, 'i18n', `${lang}.json`), 'utf8'));
    } catch {
      out[lang] = {};
    }
  }
  return out;
}

/** `t('key', {n: 1})`: the current language, then English, then the key itself. */
export function translator(dicts: Record<Lang, Dictionary>, getLang: () => Lang | null) {
  return (key: string, params?: Params): string => {
    let s = dicts[getLang() ?? 'en']?.[key] ?? dicts.en?.[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
