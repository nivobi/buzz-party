// The single source of truth for which keyboard key stands for which buzzer
// button. PCSX2's config and the input bridge both read from here.

export type Button = 'red' | 'blue' | 'orange' | 'green' | 'yellow';
export type Slot = 1 | 2 | 3 | 4;

/** Phone order, top to bottom, same as the real Buzz! buzzer. */
export const BUTTONS: readonly Button[] = ['red', 'blue', 'orange', 'green', 'yellow'];
export const SLOTS: readonly Slot[] = [1, 2, 3, 4];

// One row per player, columns in BUTTONS order.
const KEY_ROWS = {
  1: ['1', 'Q', 'A', 'Z', 'X'],
  2: ['2', 'W', 'S', 'C', 'V'],
  3: ['3', 'E', 'D', 'B', 'N'],
  4: ['4', 'R', 'F', 'G', 'H'],
} as const;

export type KeyName = (typeof KEY_ROWS)[Slot][number];

export function keyFor(slot: Slot, button: Button): KeyName {
  return KEY_ROWS[slot][BUTTONS.indexOf(button)];
}

/** macOS virtual key codes (kVK_ANSI_*), layout independent. */
export const MAC_KEYCODES: Record<KeyName, number> = {
  '1': 0x12, '2': 0x13, '3': 0x14, '4': 0x15,
  Q: 0x0c, W: 0x0d, E: 0x0e, R: 0x0f,
  A: 0x00, S: 0x01, D: 0x02, F: 0x03,
  Z: 0x06, X: 0x07, C: 0x08, V: 0x09,
  B: 0x0b, N: 0x2d, G: 0x05, H: 0x04,
};

/** Linux evdev key codes (KEY_* in linux/input-event-codes.h). */
export const LINUX_KEYCODES: Record<KeyName, number> = {
  '1': 2, '2': 3, '3': 4, '4': 5,
  Q: 16, W: 17, E: 18, R: 19,
  A: 30, S: 31, D: 32, F: 33,
  Z: 44, X: 45, C: 46, V: 47,
  B: 48, N: 49, G: 34, H: 35,
};

export function pcsx2BindingName(slot: Slot, button: Button): string {
  return `BuzzDevice_${button[0].toUpperCase()}${button.slice(1)}${slot}`;
}
