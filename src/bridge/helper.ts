import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * A native helper process spoken to one command per line, one reply line per
 * command. Restarted once if it dies; commands then answer "fail".
 */
export class HelperProcess {
  private child: ChildProcess | null = null;
  private waiting: ((line: string) => void)[] = [];
  private respawned = false;

  constructor(private path: string) {
    this.start();
  }

  private start(): void {
    const child = spawn(this.path, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.child = child;
    createInterface({ input: child.stdout! }).on('line', line => this.waiting.shift()?.(line));
    // A helper that cannot start (missing file, no permission) emits 'error'
    // and may never 'exit'; either way it is gone, and waiting commands must fail.
    const died = (retry: boolean) => {
      if (this.child !== child) return;
      this.child = null;
      for (const w of this.waiting.splice(0)) w('fail');
      if (retry && !this.respawned) {
        this.respawned = true;
        this.start();
      }
    };
    child.on('error', () => died(false));
    child.on('exit', () => died(true));
    child.stdin!.on('error', () => {});
  }

  send(cmd: string): Promise<string> {
    if (!this.child) return Promise.resolve('fail');
    return new Promise(resolve => {
      this.waiting.push(resolve);
      this.child!.stdin!.write(cmd + '\n');
    });
  }

  /** Replaces the process with a fresh one (some OS permissions are read once per process). */
  restart(): void {
    const old = this.child;
    this.start();
    old?.kill();
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
  }
}
