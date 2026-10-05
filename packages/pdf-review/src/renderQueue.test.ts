import { describe, expect, it } from "vitest";
import { RenderQueue } from "./renderQueue";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("RenderQueue", () => {
  it("runs at most `concurrency` jobs at once", async () => {
    const q = new RenderQueue(2);
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
    const jobs = gates.map((g) => q.enqueue(0, () => g.promise));
    expect(q.running).toBe(2);
    expect(q.pending).toBe(1);
    gates[0]!.resolve(1);
    await tick();
    expect(q.running).toBe(2);
    expect(q.pending).toBe(0);
    gates[1]!.resolve(2);
    gates[2]!.resolve(3);
    expect(await Promise.all(jobs.map((j) => j.promise))).toEqual([1, 2, 3]);
  });

  it("starts the highest priority waiting job first", async () => {
    const q = new RenderQueue(1);
    const order: string[] = [];
    const gate = deferred<void>();
    q.enqueue(0, () => gate.promise);
    const job = (name: string, p: number) =>
      q.enqueue(p, async () => {
        order.push(name);
      });
    const all = [job("low", 1), job("high", 5), job("mid", 3), job("mid2", 3)];
    gate.resolve();
    await Promise.all(all.map((j) => j.promise));
    expect(order).toEqual(["high", "mid", "mid2", "low"]);
  });

  it("a job cancelled while queued never starts and resolves null", async () => {
    const q = new RenderQueue(1);
    const gate = deferred<void>();
    q.enqueue(0, () => gate.promise);
    let ran = false;
    const job = q.enqueue(0, async () => {
      ran = true;
      return 1;
    });
    job.cancel();
    expect(q.pending).toBe(0);
    gate.resolve();
    expect(await job.promise).toBeNull();
    await tick();
    expect(ran).toBe(false);
  });

  it("a running job is aborted through its onCancel hook and resolves null", async () => {
    const q = new RenderQueue(1);
    const work = deferred<number>();
    let aborted = false;
    const job = q.enqueue(0, (ctx) => {
      ctx.onCancel(() => {
        aborted = true;
        work.reject(new Error("cancelled"));
      });
      return work.promise;
    });
    job.cancel();
    expect(aborted).toBe(true);
    expect(await job.promise).toBeNull();
    await tick();
    expect(q.running).toBe(0);
  });

  it("a failing job resolves null and frees its slot", async () => {
    const q = new RenderQueue(1);
    const bad = q.enqueue(0, async () => {
      throw new Error("boom");
    });
    const good = q.enqueue(0, async () => 7);
    expect(await bad.promise).toBeNull();
    expect(await good.promise).toBe(7);
  });
});
