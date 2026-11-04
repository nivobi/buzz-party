import type { KeyName } from '../shared/keymap.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** OS-level input and window control. One implementation per OS. */
export interface KeyBridge {
  keyDown(k: KeyName): void;
  keyUp(k: KeyName): void;
  focusPid(pid: number): void;
  placeWindow(pid: number, r: Rect): Promise<boolean>;
  toggleFullscreen(): void;
  isTrusted(prompt: boolean): Promise<boolean>;
  /** False when the native helper behind the key presses has died for good. */
  isAlive?(): boolean;
  dispose(): void;
}
