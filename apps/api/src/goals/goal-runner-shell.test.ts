import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { LoggerService } from "../shared/logging/logger.service";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { GoalRunnerService } from "./goal-runner.service";

/**
 * Phase 12.3 — resource governance for the deterministic `checks` verifier shell:
 * a hung command is killed by a wall-clock deadline (whole process group), the
 * output accumulator is capped, and shutdown reaps any in-flight child. These touch
 * only `this.liveShells` + `this.shellTimeoutMs()`, so a minimal instance suffices.
 */
function makeService(goalVerifyTimeoutMs = 200): GoalRunnerService {
  const noop = () => {};
  const logger = {
    child: () => ({ info: noop, warn: noop, error: noop }),
  } as unknown as LoggerService;
  return new GoalRunnerService(
    "/tmp/goal-runner-shell-test",
    null as never, // goals
    null as never, // agentRunner
    null as never, // pipelineRunner
    null as never, // projects
    null as never, // workspace
    null as never, // budget
    null as never, // activity
    logger,
    null as never, // trace
    fakeSystemConfigStore({ goalVerifyTimeoutMs }),
  );
}

/** `process.kill(pid, 0)` probes liveness without signalling. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("GoalRunnerService verifier shell governance (12.3)", () => {
  it("times out and kills a hung command, returning the timeout code", async () => {
    const svc = makeService();
    const start = Date.now();
    // A command that would otherwise run for 30s — the 200ms deadline must win.
    const result = await (
      svc as unknown as {
        runShell: (
          c: string,
          a: string[],
          cwd: string,
        ) => Promise<{ code: number; output: string }>;
      }
    ).runShell("/bin/sh", ["-c", "sleep 30"], "/tmp");

    expect(result.code).toBe(124);
    expect(result.output).toMatch(/timed out/);
    expect(Date.now() - start).toBeLessThan(5000); // killed promptly, not after 30s
    // The tracking set is emptied on settle so shutdown has nothing stale to reap.
    expect((svc as unknown as { liveShells: Set<unknown> }).liveShells.size).toBe(0);
  });

  it("caps the captured output to a rolling tail", async () => {
    const svc = makeService(600_000); // a long deadline; let it run to completion
    // Emit ~1.4 MB — past the 1 MB cap — and assert the accumulator stayed bounded.
    const result = await (
      svc as unknown as {
        runShell: (
          c: string,
          a: string[],
          cwd: string,
        ) => Promise<{ code: number; output: string }>;
      }
    ).runShell("node", ["-e", "process.stdout.write('x'.repeat(1_400_000))"], "/tmp");

    expect(result.code).toBe(0);
    expect(result.output.length).toBeLessThanOrEqual(1_000_000);
    expect(result.output.length).toBeGreaterThan(900_000);
  });

  it("onDriveError marks the run failed without throwing (no unhandled rejection)", async () => {
    const svc = makeService();
    const run = { goalRunId: "g_1", status: "running", currentIteration: 2 } as never as {
      status: string;
      currentIteration: number | null;
    };
    await (
      svc as unknown as { onDriveError: (r: unknown, e: unknown) => Promise<void> }
    ).onDriveError(run, new Error("PipelineNotFoundError"));
    expect(run.status).toBe("failed");
    expect(run.currentIteration).toBeNull();
  });

  it("onModuleDestroy reaps tracked in-flight children", async () => {
    const svc = makeService();
    const child = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
    const pid = child.pid ?? 0;
    expect(pid).toBeGreaterThan(0);
    (svc as unknown as { liveShells: Set<unknown> }).liveShells.add(child);

    expect(alive(pid)).toBe(true);
    svc.onModuleDestroy();
    expect((svc as unknown as { liveShells: Set<unknown> }).liveShells.size).toBe(0);

    await sleep(300); // SIGTERM delivery + process teardown
    expect(alive(pid)).toBe(false);
  });
});
