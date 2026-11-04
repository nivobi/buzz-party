import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../src/core/titles.ts', import.meta.url), 'utf8');
const entries = [...src.matchAll(/^\s*'([A-Z]{4}-\d{5})':\s*'([^']+)',/gm)];

describe('TITLES table', () => {
  it('has no duplicate serials', () => {
    const serials = entries.map(m => m[1]);
    expect(new Set(serials).size).toBe(serials.length);
  });

  it('has the expected number of entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(94);
  });

  it('every title starts with "Buzz!"', () => {
    for (const m of entries) expect(m[2], m[1]).toMatch(/^Buzz!/);
  });
});
