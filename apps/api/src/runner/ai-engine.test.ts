import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OpencodeUnavailableError,
  assertOpencodeReady,
  clearOpencodeCache,
  resolveAiEngine,
  spendsClaudeSubscription,
} from "./ai-engine";
import { ClaudeUnavailableError } from "./claude-preflight.service";

describe("resolveAiEngine", () => {
  const global = { aiEngine: "opencode" as const, opencodeModel: "opencode/big-pickle" };

  it("agent override wins over the global engine", () => {
    expect(resolveAiEngine({ engine: "claude" }, global)).toEqual({ engine: "claude" });
    expect(
      resolveAiEngine(
        { engine: "opencode", engineModel: "x/y" },
        { ...global, aiEngine: "claude" },
      ),
    ).toEqual({ engine: "opencode", model: "x/y" });
  });

  it("falls back to the global engine and model, then to claude", () => {
    expect(resolveAiEngine({}, global)).toEqual({
      engine: "opencode",
      model: "opencode/big-pickle",
    });
    expect(resolveAiEngine({}, undefined)).toEqual({ engine: "claude" });
    expect(resolveAiEngine({ engine: "opencode" }, undefined)).toEqual({
      engine: "opencode",
      model: "",
    });
  });
});

describe("spendsClaudeSubscription", () => {
  it("is true for claude (and pre-engine runs) and opencode claude-agent models only", () => {
    expect(spendsClaudeSubscription("claude")).toBe(true);
    expect(spendsClaudeSubscription(undefined)).toBe(true);
    expect(spendsClaudeSubscription("opencode", "claude-agent/haiku")).toBe(true);
    expect(spendsClaudeSubscription("opencode", "claude-agent/sonnet#high")).toBe(true);
    expect(spendsClaudeSubscription("opencode", "opencode/big-pickle")).toBe(false);
    expect(spendsClaudeSubscription("opencode", "anthropic/claude-sonnet-4")).toBe(false);
    expect(spendsClaudeSubscription("opencode", "")).toBe(false);
    expect(spendsClaudeSubscription("opencode")).toBe(false);
  });
});

describe("assertOpencodeReady", () => {
  let dir: string;
  const saved = process.env.OPENCODE_BIN;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-bin-"));
    clearOpencodeCache();
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.OPENCODE_BIN;
    else process.env.OPENCODE_BIN = saved;
    clearOpencodeCache();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function fakeBin(body: string): Promise<void> {
    const bin = path.join(dir, "opencode");
    await fs.writeFile(bin, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    process.env.OPENCODE_BIN = bin;
  }

  it("passes a listed model (variant suffix ignored)", async () => {
    await fakeBin('echo "opencode/big-pickle"; echo "anthropic/claude-sonnet-4"');
    await expect(assertOpencodeReady("opencode/big-pickle")).resolves.toBeUndefined();
    await expect(assertOpencodeReady("anthropic/claude-sonnet-4#high")).resolves.toBeUndefined();
  });

  it("refuses no model, an unknown model and a missing binary — as a 503-mapped error", async () => {
    await fakeBin('echo "opencode/big-pickle"');
    await expect(assertOpencodeReady("")).rejects.toThrow(/no model chosen/);
    await expect(assertOpencodeReady("openai/gpt-x")).rejects.toThrow(/not in `opencode models`/);
    process.env.OPENCODE_BIN = path.join(dir, "missing");
    clearOpencodeCache();
    const err = await assertOpencodeReady("opencode/big-pickle").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpencodeUnavailableError);
    expect(err).toBeInstanceOf(ClaudeUnavailableError);
    expect(String((err as Error).message)).toMatch(/^opencode unavailable: /);
  });
});
