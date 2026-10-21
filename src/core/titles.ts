import { basename, extname } from 'node:path';

// Known Buzz! Junior discs, all regions (from PCSX2's GameIndex.yaml).
const TITLES: Record<string, string> = {
  'SCUS-97596': 'Buzz! Junior: Jungle Party',
  'SCUS-97602': 'Buzz! Junior: Jungle Party',
  'SCUS-97597': 'Buzz! Junior: RoboJam',
  'SCUS-97634': 'Buzz! Junior: RoboJam',
  'SCED-54345': 'Buzz! Junior: Jungle Party',
  'SCES-54219': 'Buzz! Junior: Jungle Party',
  'SCES-54220': 'Buzz! Junior: Jungle Party',
  'SCES-54524': 'Buzz! Junior: Jungle Party',
  'SCES-54676': 'Buzz! Junior: RoboJam',
  'SCES-54701': 'Buzz! Junior: RoboJam',
  'SCED-54808': 'Buzz! Junior: RoboJam + Jungle Party',
  'SCES-54625': 'Buzz! Junior: Monster Rumble',
  'SCES-54703': 'Buzz! Junior: Monster Rumble',
  'SCES-54749': 'Buzz! Junior: Dino Den',
  'SCES-54750': 'Buzz! Junior: Dino Den',
  'SCES-55210': 'Buzz! Junior: Ace Racers',
  'SCES-55211': 'Buzz! Junior: Ace Racers',
};

export function titleFor(serial: string | null, fileName: string): string {
  return (serial && TITLES[serial]) || basename(fileName, extname(fileName));
}

const LANGUAGES: Record<string, string> = {
  Da: 'Dansk', En: 'English', Sv: 'Svenska', No: 'Norsk', Fi: 'Suomi',
  De: 'Deutsch', Fr: 'Français', Es: 'Español', It: 'Italiano', Nl: 'Nederlands',
  Pt: 'Português', Pl: 'Polski', Ru: 'Русский', Cs: 'Čeština', El: 'Ελληνικά',
  Hu: 'Magyar', Tr: 'Türkçe', Ja: '日本語',
};

/** `Game (Europe) (En,Da,Sv).iso` → `['Dansk', 'English', 'Svenska']`; Danish first. */
export function languagesFromName(fileName: string): string[] {
  const groups = [...fileName.matchAll(/\(([A-Z][a-z](?:,[A-Z][a-z])*)\)/g)];
  const codes = groups.at(-1)?.[1].split(',') ?? [];
  const known = codes.filter(c => LANGUAGES[c]);
  known.sort((a, b) => Number(b === 'Da') - Number(a === 'Da'));
  return known.map(c => LANGUAGES[c]);
}
