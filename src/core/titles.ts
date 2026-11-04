import { basename, extname } from 'node:path';

// Known Buzz! discs, all regions (from PCSX2's GameIndex.yaml). Anything not listed
// here still works: it is shown under its file name.
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
  // The quiz games and other regional editions, by title.
  'SCES-55419': 'Buzz! Brain of Oz',
  'SCES-55388': 'Buzz! Brain of Spain-Portugal',
  'SCES-55421': 'Buzz! Brain of Switzerland',
  'SCES-55385': 'Buzz! Brain of the UK',
  'SCES-55423': 'Buzz! Brain of the World',
  'SCES-55424': 'Buzz! Brain of the World',
  'SCES-55425': 'Buzz! Brain of the World',
  'SCES-53883': 'Buzz! Das große Quiz',
  'SCES-54499': 'Buzz! Das Mega-Quiz',
  'SCES-54259': 'Buzz! Das Sport-Quiz',
  'SCES-55420': 'Buzz! De Slimste van Nederland',
  'SCES-55387': 'Buzz! Deutschlands Superquiz',
  'SCES-54262': 'Buzz! El Gran Concurso de Deportes',
  'SCES-53884': 'Buzz! El Gran Reto',
  'SCES-54500': 'Buzz! El Mega Concurso',
  'SCES-55213': 'Buzz! Escuela de Talentos',
  'SCES-54848': 'Buzz! Hollywood',
  'SCES-54854': 'Buzz! Hollywood Quiz',
  'SCES-55389': 'Buzz! Il Quizzone Nazionale',
  'SCES-53882': 'Buzz! Il Superquiz',
  'SCED-55432': 'Buzz! Junior: Ace Racers (Demo)',
  'SCES-53881': 'Buzz! Le Grand Quiz',
  'SCES-54497': 'Buzz! Le Mega Quiz',
  'SCES-55386': 'Buzz! Le Plus Malin des Francais',
  'SCES-54260': 'Buzz! Le Quiz du Sport',
  'SCES-54690': 'Buzz! Mega Quiz',
  'SCES-54503': 'Buzz! Megavisa',
  'SCES-53929': 'Buzz! O Grande Quiz',
  'SCES-54504': 'Buzz! O Mega Quiz',
  'SCES-54263': 'Buzz! O Quiz Desportivo',
  'SCES-55107': 'Buzz! Pop Quiz',
  'SCES-54267': 'Buzz! Sporttivisa',
  'SCES-53927': 'Buzz! Suuri Tietovisa',
  'SCES-53879': 'Buzz! The Big Quiz',
  'SCES-53880': 'Buzz! The Big Quiz',
  'SCES-53925': 'Buzz! The Big Quiz',
  'SCES-53926': 'Buzz! The Big Quiz',
  'SCES-54071': 'Buzz! The Big Quiz',
  'SCES-54073': 'Buzz! The Big Quiz',
  'SCES-54844': 'Buzz! The Hollywood Quiz',
  'SCES-54845': 'Buzz! The Hollywood Quiz',
  'SCES-54851': 'Buzz! The Hollywood Quiz',
  'SCES-54852': 'Buzz! The Hollywood Quiz',
  'SCES-54856': 'Buzz! The Hollywood Quiz',
  'SCUS-97594': 'Buzz! The Hollywood Quiz',
  'SCUS-97633': 'Buzz! The Hollywood Quiz',
  'SCES-54689': 'Buzz! The Maha Quiz',
  'SCES-54496': 'Buzz! The Mega Quiz',
  'SCES-54498': 'Buzz! The Mega Quiz',
  'SCES-54501': 'Buzz! The Mega Quiz',
  'SCES-54505': 'Buzz! The Mega Quiz',
  'SCES-54507': 'Buzz! The Mega Quiz',
  'SCUS-97592': 'Buzz! The Mega Quiz',
  'SCUS-97601': 'Buzz! The Mega Quiz',
  'SCES-53304': 'Buzz! The Music Quiz',
  'SCES-53305': 'Buzz! The Music Quiz',
  'SCES-53307': 'Buzz! The Music Quiz',
  'SCES-53308': 'Buzz! The Music Quiz',
  'SCES-53663': 'Buzz! The Music Quiz',
  'SCES-53669': 'Buzz! The Music Quiz',
  'SCES-55093': 'Buzz! The Pop Quiz',
  'SCES-55094': 'Buzz! The Pop Quiz',
  'SCES-55095': 'Buzz! The Pop Quiz',
  'SCES-55096': 'Buzz! The Pop Quiz',
  'SCES-55097': 'Buzz! The Pop Quiz',
  'SCES-55098': 'Buzz! The Pop Quiz',
  'SCES-55100': 'Buzz! The Pop Quiz',
  'SCES-54941': 'Buzz! The Schools Quiz',
  'SCED-54238': 'Buzz! The Sports Quiz',
  'SCED-54363': 'Buzz! The Sports Quiz',
  'SCES-54258': 'Buzz! The Sports Quiz',
  'SCES-54261': 'Buzz! The Sports Quiz',
  'SCES-54264': 'Buzz! The Sports Quiz',
  'SCES-54265': 'Buzz! The Sports Quiz',
  'SCES-54266': 'Buzz! The Sports Quiz',
  'SCES-54268': 'Buzz! The Sports Quiz',
  'SCES-54269': 'Buzz! The Sports Quiz',
};

export function titleFor(serial: string | null, fileName: string): string {
  // `Game.iso.gz` should read as `Game`, not `Game.iso`.
  const bare = basename(fileName, extname(fileName)).replace(/\.(iso|bin|cso|chd)$/i, '');
  return (serial && TITLES[serial]) || bare;
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
