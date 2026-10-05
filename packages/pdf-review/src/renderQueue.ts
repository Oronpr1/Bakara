/**
 * A small priority queue for raster work. pdf.js paints onto the canvas on the
 * main thread, so firing a render for every page at once (a zoom on a long
 * document) freezes the UI. Jobs run with limited concurrency, highest
 * priority first, and can be cancelled whether queued or running.
 *
 * Adapted from pdf-guard's render scheduler (src/pdf/render.ts, same author),
 * with cancellation of queued jobs added so an off-screen page never starts.
 */

export interface RenderJob<T> {
  /** Resolves with the job's result, or null when it was cancelled. */
  promise: Promise<T | null>;
  cancel(): void;
}

/** What a job body receives: whether it has been cancelled, and a hook to abort its own work. */
export interface JobContext {
  readonly cancelled: boolean;
  onCancel(fn: () => void): void;
}

interface Queued {
  priority: number;
  seq: number;
  start: () => void;
  drop: () => void;
}

export class RenderQueue {
  private active = 0;
  private seq = 0;
  private readonly waiting: Queued[] = [];

  constructor(private readonly concurrency = 2) {}

  get pending(): number {
    return this.waiting.length;
  }

  get running(): number {
    return this.active;
  }

  /** Higher priority runs first; equal priorities run in arrival order. */
  enqueue<T>(priority: number, run: (ctx: JobContext) => Promise<T>): RenderJob<T> {
    let cancelled = false;
    let started = false;
    let abort: (() => void) | null = null;
    let settle!: (v: T | null) => void;
    const promise = new Promise<T | null>((resolve) => (settle = resolve));

    const ctx: JobContext = {
      get cancelled() {
        return cancelled;
      },
      onCancel: (fn) => {
        abort = fn;
      },
    };

    const entry: Queued = {
      priority,
      seq: this.seq++,
      drop: () => settle(null),
      start: () => {
        started = true;
        this.active++;
        run(ctx)
          .then(
            (v) => settle(cancelled ? null : v),
            () => settle(null),
          )
          .finally(() => {
            this.active--;
            this.pump();
          });
      },
    };
    this.waiting.push(entry);
    this.pump();

    return {
      promise,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (!started) {
          const i = this.waiting.indexOf(entry);
          if (i >= 0) this.waiting.splice(i, 1);
          entry.drop();
          return;
        }
        try {
          abort?.();
        } catch {
          /* already finished */
        }
      },
    };
  }

  private pump(): void {
    while (this.active < this.concurrency && this.waiting.length) {
      this.waiting.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
      this.waiting.shift()!.start();
    }
  }
}
