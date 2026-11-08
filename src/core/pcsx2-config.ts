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

/** Lines a PS2 game draws, about; the multiplier brings that up to the TV's height. */
const PS2_LINES = 448;
/** 4K. 3x on a 1080p TV used ~20 % of the console's GTX 960 (2026-11-08). */
const MAX_UPSCALE = 5;

/** PCSX2's upscale multiplier for a TV this many pixels high (1080p 3x, 1440p 4x, 4K 5x). */
export function upscaleFor(tvHeightPx: number | undefined): number {
  if (!tvHeightPx || !(tvHeightPx > 0)) return 3;
  return Math.min(MAX_UPSCALE, Math.max(1, Math.ceil(tvHeightPx / PS2_LINES)));
}

/** PCSX2.ini for Buzz Party, patched from an ini PCSX2 generated itself. */
export function buildPcsx2Ini(
  template: string,
  o: { biosDir: string; biosFile: string; startFullscreen: boolean; ledUdpPort?: number;
    /** The TV's height in real pixels; picks the upscaling. */
    tvHeightPx?: number },
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

  // Sharp text: draw the game at the TV's resolution. VSync: nothing else on the
  // console stops tearing (no compositor), and one frame of delay is the same for
  // every player.
  set(sections, 'EmuCore/GS', 'upscale_multiplier', String(upscaleFor(o.tvHeightPx)));
  set(sections, 'EmuCore/GS', 'VsyncEnable', 'true');

  // The default PS2 pad's keyboard binds clash with the buzzer keys.
  const pad1 = sectionOf(sections, 'Pad1');
  pad1.lines = pad1.lines.filter(l => !/ = Keyboard\//.test(l));

  const usb1 = sectionOf(sections, 'USB1');
  usb1.lines = [
    'Type = BuzzDevice',
    ...SLOTS.flatMap(s => BUTTONS.map(b => `${pcsx2BindingName(s, b)} = Keyboard/${keyFor(s, b)}`)),
    // Our patched PCSX2 sends the buzzer lights here; stock PCSX2 ignores it.
    ...(o.ledUdpPort && o.ledUdpPort > 0 ? [`BuzzDevice_LedUdpPort = ${o.ledUdpPort}`] : []),
    '',
    '',
  ];

  return serialize(sections);
}
