import { BUTTONS, keyFor, pcsx2BindingName, SLOTS } from '../shared/keymap.js';

interface Section {
  name: string | null; // null = lines before the first header
  lines: string[];
}

function parse(ini: string): Section[] {
  const sections: Section[] = [{ name: null, lines: [] }];
  for (const line of ini.split('\n')) {
    const m = /^\[(.+)\]$/.exec(line);
    if (m) sections.push({ name: m[1], lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function serialize(sections: Section[]): string {
  return sections.map(s => (s.name === null ? s.lines : [`[${s.name}]`, ...s.lines]).join('\n')).join('\n');
}

function sectionOf(sections: Section[], name: string): Section {
  let s = sections.find(x => x.name === name);
  if (!s) {
    s = { name, lines: ['', ''] };
    sections.push(s);
  }
  return s;
}

function set(sections: Section[], name: string, key: string, value: string): void {
  const s = sectionOf(sections, name);
  const line = `${key} = ${value}`;
  const i = s.lines.findIndex(l => l.startsWith(`${key} =`));
  if (i >= 0) {
    s.lines[i] = line;
    return;
  }
  // Insert before the blank lines that separate sections.
  let at = s.lines.length;
  while (at > 0 && s.lines[at - 1].trim() === '') at--;
  s.lines.splice(at, 0, line);
}

/** PCSX2.ini for Buzz Party, patched from an ini PCSX2 generated itself. */
export function buildPcsx2Ini(
  template: string,
  o: { biosDir: string; biosFile: string; startFullscreen: boolean },
): string {
  const sections = parse(template);

  set(sections, 'UI', 'SetupWizardIncomplete', 'false');
  set(sections, 'UI', 'ConfirmShutdown', 'false');
  set(sections, 'UI', 'HideMouseCursor', 'true');
  set(sections, 'UI', 'PauseOnFocusLoss', 'false');
  set(sections, 'UI', 'StartFullscreen', String(o.startFullscreen));
  set(sections, 'Folders', 'Bios', o.biosDir);
  set(sections, 'Filenames', 'BIOS', o.biosFile);
  set(sections, 'AutoUpdater', 'CheckAtStartup', 'false');

  // The default PS2 pad's keyboard binds clash with the buzzer keys.
  const pad1 = sectionOf(sections, 'Pad1');
  pad1.lines = pad1.lines.filter(l => !/ = Keyboard\//.test(l));

  const usb1 = sectionOf(sections, 'USB1');
  usb1.lines = [
    'Type = BuzzDevice',
    ...SLOTS.flatMap(s => BUTTONS.map(b => `${pcsx2BindingName(s, b)} = Keyboard/${keyFor(s, b)}`)),
    '',
    '',
  ];

  return serialize(sections);
}
