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

  describe("reentrancy (Task 3)", () => {
    // A non-reentrant regression deadlocks (the inner call queues behind the
    // outer one, which never settles because it's waiting on the inner call) —
    // a bounded per-test timeout turns that into a clean failure instead of
    // hanging the whole suite/CI job.
    it("a nested call on the SAME key runs inline instead of deadlocking", async () => {
      const log: string[] = [];
      const result = await withPathLock("k", async () => {
        log.push("outer:start");
        const inner = await withPathLock("k", async () => {
          log.push("inner:run");
          return "inner-result";
        });
        log.push("outer:end");
        return inner;
      });
      expect(result).toBe("inner-result");
      expect(log).toEqual(["outer:start", "inner:run", "outer:end"]);
    }, 2000);

    it("nested calls on DIFFERENT keys stay fully concurrent", async () => {
      const log: string[] = [];
      await withPathLock("outer-key", async () => {
        log.push("outer:start");
        await Promise.all([
          withPathLock("x", async () => {
            log.push("x:start");
            await tick();
            log.push("x:end");
          }),
          withPathLock("y", async () => {
            log.push("y:start");
            await tick();
            log.push("y:end");
          }),
        ]);
        log.push("outer:end");
      });
      // x and y both started before either ended — still interleaved, not
      // serialized against each other just because they're nested.
      expect(log.slice(1, 3).sort()).toEqual(["x:start", "y:start"]);
    });

    it("no held-set leakage: an unrelated later call for the same key is not treated as already held", async () => {
      const log: string[] = [];
      await withPathLock("shared", async () => {
        log.push("first:run");
      });
      // A fresh, independent async chain (this `it` body, after the first
      // withPathLock settled) must still queue normally — not run inline as if
      // it inherited the first call's held-set.
      await Promise.all([
        withPathLock("shared", async () => {
          log.push("second:start");
          await tick();
          log.push("second:end");
        }),
        withPathLock("shared", async () => {
          log.push("third:start");
          await tick();
          log.push("third:end");
        }),
      ]);
      expect(log).toEqual(["first:run", "second:start", "second:end", "third:start", "third:end"]);
    });

    it("a 3-level-deep nest on the same key all runs inline", async () => {
      const log: string[] = [];
      await withPathLock("deep", async () => {
        log.push("1");
        await withPathLock("deep", async () => {
          log.push("2");
          await withPathLock("deep", async () => {
            log.push("3");
          });
        });
      });
      expect(log).toEqual(["1", "2", "3"]);
    }, 2000);
  });
});
