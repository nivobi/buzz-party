import type { Presser } from '../bridge/presser.js';
import type { Game } from '../core/games.js';
import type { SlotManager } from '../core/slots.js';
import type { Button } from '../shared/keymap.js';
import type { Mode, PhoneMsg, PhoneState, TvState } from '../shared/protocol.js';

/** What the controller needs from the emulator side. */
export interface GameRunner {
  launch(game: Game): Promise<void>;
  stop(): Promise<void>;
  onExit(cb: () => void): void;
}

export interface Join {
  url: string;
  qr: string;
}

export interface ControllerDeps {
  slots: SlotManager;
  presser: Presser;
  runner: GameRunner;
  games: Game[];
  problems: string[];
  join: Join | null;
  quit: () => void;
}

/** The whole evening as a state machine: setup → picker/waiting → game → back. */
export class Controller {
  private mode: Mode;
  private selected = 0;
  private current: Game | null = null;
  private launchError: string | null = null;
  private listeners: (() => void)[] = [];

  constructor(private d: ControllerDeps) {
    this.mode = this.homeMode();
    d.runner.onExit(() => this.gameEnded());
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  update(u: Partial<Pick<ControllerDeps, 'games' | 'problems' | 'join'>>): void {
    Object.assign(this.d, u);
    this.selected = Math.min(this.selected, Math.max(0, this.d.games.length - 1));
    if (this.mode !== 'game' && this.mode !== 'launching') this.mode = this.homeMode();
    this.changed();
  }

  phone(token: string, msg: PhoneMsg): void {
    switch (msg.t) {
      case 'hello': {
        // A fresh connection holds nothing; drop keys an old one left down.
        const slot = this.d.slots.connect(token);
        if (slot !== null) this.d.presser.releaseAll(slot);
        return this.changed();
      }
      case 'claim':
        if (this.d.slots.claim(token, msg.slot)) this.changed();
        return;
      case 'btn':
        return this.button(token, msg.b, msg.down);
      case 'menu':
        return this.menu(token, msg.action);
    }
  }

  disconnected(token: string): void {
    const slot = this.d.slots.slotOf(token);
    if (slot !== null) this.d.presser.releaseAll(slot);
    this.d.slots.disconnect(token);
    this.changed();
  }

  tick(): void {
    if (this.d.slots.sweep().length > 0) this.changed();
  }

  tvState(): TvState {
    const problems = [...this.d.problems];
    if (this.launchError) problems.push(this.launchError);
    return {
      mode: this.mode,
      games: this.d.games,
      selected: this.selected,
      slots: this.d.slots.view(),
      joinUrl: this.d.join?.url ?? null,
      qr: this.d.join?.qr ?? null,
      problems,
      gameTitle: this.current?.title ?? null,
    };
  }

  phoneState(token: string): PhoneState {
    return {
      t: 'state',
      mode: this.mode,
      you: this.d.slots.slotOf(token),
      slots: this.d.slots.view(),
      joinUrl: this.d.join?.url ?? '',
      qr: this.d.join?.qr ?? '',
      selectedTitle: this.mode === 'setup' ? null : (this.current ?? this.d.games[this.selected])?.title ?? null,
    };
  }

  private homeMode(): Mode {
    if (this.d.problems.length > 0) return 'setup';
    return this.d.games.length === 1 ? 'waiting' : 'picker';
  }

  private button(token: string, b: Button, down: boolean): void {
    const slot = this.d.slots.slotOf(token);
    if (slot === null) return;
    if (this.mode === 'game') {
      if (down) this.d.presser.press(slot, b);
      else this.d.presser.release(slot, b);
      return;
    }
    if (!down) return;
    const n = this.d.games.length;
    if (this.mode === 'picker' && n > 0) {
      if (b === 'orange') this.selected = (this.selected + 1) % n;
      else if (b === 'blue') this.selected = (this.selected - 1 + n) % n;
      else if (b === 'red') return void this.launch(this.d.games[this.selected]);
      else return;
      this.changed();
    } else if (this.mode === 'waiting' && b === 'red' && n > 0) {
      void this.launch(this.d.games[0]);
    }
  }

  private menu(token: string, action: 'back' | 'off' | 'leave'): void {
    if (action === 'leave') {
      const slot = this.d.slots.slotOf(token);
      if (slot !== null) this.d.presser.releaseAll(slot);
      this.d.slots.release(token);
      this.changed();
    } else if (action === 'back') {
      if (this.mode === 'game' || this.mode === 'launching') {
        this.d.presser.releaseAll();
        void this.d.runner.stop().finally(() => this.gameEnded());
      }
    } else if (action === 'off') {
      if (this.mode === 'picker' || this.mode === 'waiting' || this.mode === 'setup') this.d.quit();
    }
  }

  private async launch(game: Game): Promise<void> {
    this.mode = 'launching';
    this.current = game;
    this.launchError = null;
    this.changed();
    try {
      await this.d.runner.launch(game);
      if (this.mode === 'launching') {
        this.mode = 'game';
        this.changed();
      }
    } catch (e) {
      // A launch cancelled by "Back to games" is not an error worth showing.
      if (!(e instanceof Error && e.name === 'LaunchCancelled')) {
        this.launchError = `Couldn’t start the game: ${e instanceof Error ? e.message : String(e)}`;
      }
      this.gameEnded();
    }
  }

  private gameEnded(): void {
    this.d.presser.releaseAll();
    if (this.mode !== 'game' && this.mode !== 'launching') return;
    this.mode = this.homeMode();
    this.current = null;
    this.changed();
  }

  private changed(): void {
    for (const cb of this.listeners) cb();
  }
}
