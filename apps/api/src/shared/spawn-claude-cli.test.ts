import { EventEmitter } from "node:events";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { spawnClaudeCli } from "./spawn-claude-cli";

const spawnMock = vi.mocked(spawn);

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

/** Queue the next spawn to hand back a fresh fake child. */
function nextSpawn(): FakeChild {
  const child = fakeChild();
  spawnMock.mockImplementationOnce(() => child as unknown as ReturnType<typeof spawn>);
  return child;
}

describe("spawnClaudeCli", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spawnMock.mockReset();
    delete process.env.CLAUDE_BIN;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CLAUDE_BIN;
  });

  it("resolves stdout on a clean exit", async () => {
    const child = nextSpawn();
    const promise = spawnClaudeCli({ args: ["-p", "hi"], timeoutMs: 8000, label: "test" });
    child.stdout.emit("data", Buffer.from('{"result":"ok"}'));
    child.emit("exit", 0);
    await expect(promise).resolves.toBe('{"result":"ok"}');
    expect(spawnMock).toHaveBeenCalledWith("claude", ["-p", "hi"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  });

  it("caps stdout accumulation at maxOutputBytes and logs the cap once (head-truncated)", async () => {
    const debugSpy = vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
    const child = nextSpawn();
    const promise = spawnClaudeCli({
      args: ["-p", "hi"],
      timeoutMs: 8000,
      label: "test",
      maxOutputBytes: 10,
    });
    // Three chunks that together exceed the 10-char cap.
    child.stdout.emit("data", Buffer.from("0123456789")); // exactly at cap
    child.stdout.emit("data", Buffer.from("more-that-should-be-dropped"));
    child.stdout.emit("data", Buffer.from("even-more"));
    child.emit("exit", 0);
    const result = await promise;
    // Head-truncated: only the first (cap-filling) chunk is kept.
    expect(result).toBe("0123456789");
    expect(result.length).toBe(10);
    // The cap-hit debug log fires exactly once, not once per overflowing chunk.
    expect(debugSpy).toHaveBeenCalledTimes(1);
    debugSpy.mockRestore();
  });

  it("rejects on timeout, kills the child, and uses the label in the message", async () => {
    nextSpawn(); // never emits exit
    const promise = spawnClaudeCli({ args: ["-p", "hi"], timeoutMs: 8000, label: "namer" });
    const outcome = promise.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(8000);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("namer timed out after 8000ms");
  });

  it("kills the child on timeout", async () => {
    const child = nextSpawn();
    const promise = spawnClaudeCli({ args: ["-p", "hi"], timeoutMs: 8000, label: "namer" });
    const outcome = promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(8000);
    await outcome;
    expect(child.kill).toHaveBeenCalled();
  });

  it("rejects with the claude-exited shape on a non-zero exit", async () => {
    const child = nextSpawn();
    const promise = spawnClaudeCli({ args: ["-p", "hi"], timeoutMs: 8000, label: "briefer" });
    const outcome = promise.then(
      () => null,
      (error: unknown) => error,
    );
    child.stderr.emit("data", Buffer.from("boom"));
    child.emit("exit", 1);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("claude exited 1: boom");
  });

  it("rejects on a spawn error", async () => {
    const child = nextSpawn();
    const promise = spawnClaudeCli({ args: ["-p", "hi"], timeoutMs: 8000, label: "router" });
    const outcome = promise.then(
      () => null,
      (error: unknown) => error,
    );
    const err = new Error("spawn claude ENOENT");
    child.emit("error", err);
    expect(await outcome).toBe(err);
  });

  it("uses CLAUDE_BIN when set", async () => {
    process.env.CLAUDE_BIN = "/opt/custom/claude";
    const child = nextSpawn();
    const promise = spawnClaudeCli({ args: ["-p", "hi"], timeoutMs: 8000, label: "test" });
    child.emit("exit", 0);
    await promise;
    expect(spawnMock).toHaveBeenCalledWith("/opt/custom/claude", ["-p", "hi"], expect.anything());
  });
});
