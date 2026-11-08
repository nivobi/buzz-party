import { readFileSync } from 'node:fs';
import { buildPcsx2Ini, upscaleFor } from '../src/core/pcsx2-config.js';
import { BUTTONS, keyFor, pcsx2BindingName, SLOTS } from '../src/shared/keymap.js';

const template = readFileSync('resources/pcsx2/PCSX2.template.ini', 'utf8');
const opts = { biosDir: '/Users/x/BuzzParty/BIOS', biosFile: 'SCPH-70004_BIOS_V12_EUR_200.BIN', startFullscreen: true };

function section(ini: string, name: string): string[] {
  const lines = ini.split('\n');
  const start = lines.indexOf(`[${name}]`);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && l.startsWith('['));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter(l => l.trim() !== '');
}
const value = (ini: string, sec: string, key: string) =>
  section(ini, sec).find(l => l.startsWith(`${key} =`))?.split(' = ')[1];

test('UI never shows', () => {
  const ini = buildPcsx2Ini(template, opts);
  expect(value(ini, 'UI', 'SetupWizardIncomplete')).toBe('false');
  expect(value(ini, 'UI', 'ConfirmShutdown')).toBe('false');
  expect(value(ini, 'UI', 'HideMouseCursor')).toBe('true');
  expect(value(ini, 'UI', 'PauseOnFocusLoss')).toBe('false');
  expect(value(ini, 'UI', 'SettingsVersion')).toBe('1');
  expect(value(ini, 'AutoUpdater', 'CheckAtStartup')).toBe('false');
});

test('StartFullscreen follows the option', () => {
  expect(value(buildPcsx2Ini(template, opts), 'UI', 'StartFullscreen')).toBe('true');
  expect(value(buildPcsx2Ini(template, { ...opts, startFullscreen: false }), 'UI', 'StartFullscreen')).toBe('false');
});

test('BIOS location', () => {
  const ini = buildPcsx2Ini(template, opts);
  expect(value(ini, 'Folders', 'Bios')).toBe(opts.biosDir);
  expect(value(ini, 'Filenames', 'BIOS')).toBe(opts.biosFile);
});

test('Buzz device with all 20 bindings from the key map', () => {
  const ini = buildPcsx2Ini(template, opts);
  expect(value(ini, 'USB1', 'Type')).toBe('BuzzDevice');
  for (const s of SLOTS) for (const b of BUTTONS) {
    expect(value(ini, 'USB1', pcsx2BindingName(s, b))).toBe(`Keyboard/${keyFor(s, b)}`);
  }
});

test('no buzzer key is bound anywhere but USB1, and Pad1 has no keyboard binds', () => {
  const ini = buildPcsx2Ini(template, opts);
  expect(section(ini, 'Pad1').some(l => l.includes('Keyboard/'))).toBe(false);
  const keys = new Set<string>(SLOTS.flatMap(s => BUTTONS.map(b => keyFor(s, b))));
  let current = '';
  for (const line of ini.split('\n')) {
    if (line.startsWith('[')) current = line;
    const m = / = Keyboard\/(\S+)$/.exec(line);
    if (m && keys.has(m[1])) expect(current).toBe('[USB1]');
  }
});

test('other sections are untouched (GS: only upscaling and VSync change)', () => {
  const ini = buildPcsx2Ini(template, opts);
  const gs = (s: string) => section(s, 'EmuCore/GS').filter(l => !/^(upscale_multiplier|VsyncEnable) =/.test(l));
  expect(gs(ini)).toEqual(gs(template));
  expect(section(ini, 'Hotkeys')).toEqual(section(template, 'Hotkeys'));
});

describe('picture: upscaled to the TV, no tearing', () => {
  // PS2 games draw about 448 lines; drawing them at the TV's own resolution is
  // what makes text sharp. Tried on the box 2026-11-08: 3x on a 1080p TV used
  // ~20 % of the GTX 960, so 4K (5x) should fit; 5x is the cap.
  test('the multiplier follows the TV height', () => {
    expect(upscaleFor(1080)).toBe(3);
    expect(upscaleFor(1440)).toBe(4);
    expect(upscaleFor(2160)).toBe(5);
    expect(upscaleFor(720)).toBe(2);
    expect(upscaleFor(448)).toBe(1);
    expect(upscaleFor(4320)).toBe(5);
  });

  test('unknown TV size gives 3x (a 1080p TV)', () => {
    for (const h of [undefined, 0, -1, Number.NaN]) expect(upscaleFor(h)).toBe(3);
  });

  test('the ini carries it, and VSync is on', () => {
    // No compositor on the box, so without VSync the picture tears (seen in Junior).
    const ini = buildPcsx2Ini(template, { ...opts, tvHeightPx: 2160 });
    expect(value(ini, 'EmuCore/GS', 'upscale_multiplier')).toBe('5');
    expect(value(ini, 'EmuCore/GS', 'VsyncEnable')).toBe('true');
    expect(section(ini, 'EmuCore/GS').filter(l => l.startsWith('upscale_multiplier ='))).toHaveLength(1);
    expect(value(buildPcsx2Ini(template, opts), 'EmuCore/GS', 'upscale_multiplier')).toBe('3');
  });
});

test('USB1 carries the light port when given', () => {
  const ini = buildPcsx2Ini(template, { ...opts, ledUdpPort: 9876 });
  expect(value(ini, 'USB1', 'BuzzDevice_LedUdpPort')).toBe('9876');
  expect(value(ini, 'USB1', 'Type')).toBe('BuzzDevice');
  for (const s of SLOTS) for (const b of BUTTONS) expect(value(ini, 'USB1', pcsx2BindingName(s, b))).toBe(`Keyboard/${keyFor(s, b)}`);
});

test('no light port line without a port', () => {
  expect(buildPcsx2Ini(template, opts)).not.toContain('LedUdpPort');
  expect(buildPcsx2Ini(template, { ...opts, ledUdpPort: 0 })).not.toContain('LedUdpPort');
});
