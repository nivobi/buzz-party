import type { Button, Slot } from './keymap.js';
import type { Game } from '../core/games.js';
import type { WifiView } from '../core/netsetup.js';

export type PhoneMsg =
  | { t: 'hello'; token: string }
  | { t: 'claim'; slot: Slot }
  | { t: 'btn'; b: Button; down: boolean }
  | { t: 'menu'; action: 'back' | 'off' | 'leave' }
  | { t: 'lang'; lang: string }
  | { t: 'sound'; on: boolean };

export type Mode = 'setup' | 'picker' | 'waiting' | 'launching' | 'game' | 'stopping' | 'wifi';

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
  /** UI sounds on or off. */
  sound: boolean;
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
  /** The OS the app runs on (process.platform), so the TV can hide hints that only apply to macOS. */
  platform: string;
  /** UI language; null until someone has picked one. */
  lang: string | null;  /** UI sounds on or off. */
  sound: boolean;
  /** The box's WiFi setup, while it runs (Linux console only); null otherwise. */
  wifi: WifiView | null;
};

/** The four buzzer lights as the game last set them, player 1 first. */
export type Lights = readonly [boolean, boolean, boolean, boolean];

/** Sent to a phone when its buzzer light changes (and with every state). */
export type PhoneLight = { t: 'light'; on: boolean };
