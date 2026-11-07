import { readFileSync } from 'node:fs';
import { buildPcsx2Ini } from '../src/core/pcsx2-config.js';
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

test('other sections are untouched', () => {
  const ini = buildPcsx2Ini(template, opts);
  expect(section(ini, 'EmuCore/GS')).toEqual(section(template, 'EmuCore/GS'));
  expect(section(ini, 'Hotkeys')).toEqual(section(template, 'Hotkeys'));
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
