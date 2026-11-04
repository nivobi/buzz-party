import type { Button, Slot } from './keymap.js';
import type { Game } from '../core/games.js';

export type PhoneMsg =
  | { t: 'hello'; token: string }
  | { t: 'claim'; slot: Slot }
  | { t: 'btn'; b: Button; down: boolean }
  | { t: 'menu'; action: 'back' | 'off' | 'leave' }
  | { t: 'lang'; lang: string };

export type Mode = 'setup' | 'picker' | 'waiting' | 'launching' | 'game';

export type SlotView = { slot: Slot; taken: boolean; connected: boolean };

export type PhoneState = {
  t: 'state';
  mode: Mode;
  you: Slot | null;
  slots: SlotView[];
  joinUrl: string;
  qr: string;
  /** The game the picker points at, so phones can show it. */
  selectedTitle: string | null;
  /** UI language; null until someone has picked one. */
  lang: string | null;
};

export type TvState = {
  mode: Mode;
  games: Game[];
  selected: number;
  slots: SlotView[];
  joinUrl: string | null;
  qr: string | null;
  problems: string[];
  gameTitle: string | null;
  /** UI language; null until someone has picked one. */
  lang: string | null;
};
