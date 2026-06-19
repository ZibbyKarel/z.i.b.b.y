import { describe, expect, it } from "vitest";
import { withPathLock } from "./file-lock";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("withPathLock", () => {
  it("runs same-key tasks strictly sequentially (no interleave)", async () => {
    const log: string[] = [];
    const task = (id: string) => async () => {
      log.push(`${id}:start`);
      await tick();
      await tick();
      log.push(`${id}:end`);
    };
    await Promise.all([withPathLock("k", task("a")), withPathLock("k", task("b"))]);
    // b cannot start until a ended — no "a:start, b:start, a:end" interleave.
    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("runs different keys concurrently", async () => {
    const log: string[] = [];
    const task = (id: string) => async () => {
      log.push(`${id}:start`);
      await tick();
      log.push(`${id}:end`);
    };
    await Promise.all([withPathLock("x", task("x")), withPathLock("y", task("y"))]);
    // Both start before either ends → interleaved.
    expect(log.slice(0, 2).sort()).toEqual(["x:start", "y:start"]);
  });

  it("returns the task's value and propagates its error", async () => {
    await expect(withPathLock("k", async () => 42)).resolves.toBe(42);
    await expect(
      withPathLock("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("a throwing task does not strand the queue — the next still runs", async () => {
    const failing = withPathLock("k", async () => {
      throw new Error("first fails");
    });
    await expect(failing).rejects.toThrow();
    await expect(withPathLock("k", async () => "second ran")).resolves.toBe("second ran");
  });

  it("two updates to one key both land in order", async () => {
    let shared = "";
    const append = (s: string) => async () => {
      const current = shared;
      await tick(); // widen the race window
      shared = current + s;
    };
    await Promise.all([withPathLock("doc", append("a")), withPathLock("doc", append("b"))]);
    expect(shared).toBe("ab"); // not "b" (lost update)
  });
});
