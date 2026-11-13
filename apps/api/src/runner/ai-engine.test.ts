import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OpencodeUnavailableError,
  applyThinkingVariant,
  assertOpencodeReady,
  clearOpencodeCache,
  resolveAiEngine,
  resolveRunEngine,
  spendsClaudeSubscription,
  stageEngineTarget,
  stageSpendsClaude,
} from "./ai-engine";
import { withBlueCodeDir } from "../ai-providers/bluecode-fixture";
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

describe("model tiers on opencode (A20) + per-step engine (A21)", () => {
  const config = {
    aiEngine: "opencode" as const,
    opencodeModel: "opencode/global",
    opencodeTierModels: { haiku: "opencode/small", opus: "opencode/big" },
  };

  it("maps the agent's tier; an explicit engineModel wins; unmapped tier → nearest lower", () => {
    expect(resolveAiEngine({ model: "opus" }, config).model).toBe("opencode/big");
    expect(resolveAiEngine({ model: "sonnet" }, config).model).toBe("opencode/small");
    expect(resolveAiEngine({ model: "fable" }, config).model).toBe("opencode/big");
    expect(resolveAiEngine({}, config).model).toBe("opencode/global");
    expect(resolveAiEngine({ model: "opus", engineModel: "x/pin" }, config).model).toBe("x/pin");
    expect(
      resolveAiEngine({ model: "sonnet" }, { ...config, opencodeTierModels: { opus: "o/x" } })
        .model,
    ).toBe("o/x"); // no lower mapping → nearest higher
  });

  it("stage precedence: phase engine/model > agent; tier = rung > phase > agent", () => {
    const agent = {
      engine: "opencode" as const,
      engineModel: "agent/pin",
      model: "haiku" as const,
    };
    // The phase pins claude: native CLI, whatever the agent says.
    expect(resolveAiEngine(stageEngineTarget({ engine: "claude" }, agent), config)).toEqual({
      engine: "claude",
    });
    // The phase's exact model beats the agent's.
    expect(
      resolveAiEngine(
        stageEngineTarget({ engine: "opencode", engineModel: "phase/pin" }, agent),
        config,
      ).model,
    ).toBe("phase/pin");
    // The agent's exact model beats the tier mapping.
    expect(resolveAiEngine(stageEngineTarget({ model: "opus" }, agent), config).model).toBe(
      "agent/pin",
    );
    // Without exact pins the escalation rung's tier really escalates on opencode.
    const plain = { model: "haiku" as const };
    expect(resolveAiEngine(stageEngineTarget({ model: "haiku" }, plain), config).model).toBe(
      "opencode/small",
    );
    expect(
      resolveAiEngine(stageEngineTarget({ model: "haiku" }, plain, { model: "opus" }), config)
        .model,
    ).toBe("opencode/big");
    // The phase's engine also moves a claude agent onto opencode.
    expect(
      resolveAiEngine(
        stageEngineTarget({ engine: "opencode", model: "opus" }, { engine: "claude" }),
        { ...config, aiEngine: "claude" },
      ),
    ).toEqual({ engine: "opencode", model: "opencode/big" });
  });

  it("stageSpendsClaude counts every escalation rung", () => {
    const resolve = (t: Parameters<typeof resolveAiEngine>[0]) =>
      resolveAiEngine(t, {
        ...config,
        opencodeTierModels: { haiku: "opencode/small", opus: "claude-agent/opus" },
      });
    const phase = { model: "haiku" as const };
    expect(stageSpendsClaude(phase, {}, resolve)).toBe(false);
    expect(
      stageSpendsClaude(
        {
          ...phase,
          loop: {
            to: "x",
            maxRetries: 1,
            escalate: true,
            then: "fail",
            escalation: [{ model: "opus" }],
          },
        },
        {},
        resolve,
      ),
    ).toBe(true);
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

  it("probes plain `models` when BlueCode is not configured", async () => {
    const bc = await withBlueCodeDir(false);
    try {
      await fakeBin('echo "args=$*" >&2; echo "opencode/big-pickle"; [ "$*" = "models" ]');
      await expect(assertOpencodeReady("opencode/big-pickle")).resolves.toBeUndefined();
    } finally {
      await bc.restore();
    }
  });

  it("probes `models --standalone` on the BlueCode provider config when configured (A34)", async () => {
    const bc = await withBlueCodeDir(true);
    try {
      await fakeBin(
        'if [ "$*" = "models --standalone" ] && [ "$OPENCODE_DISABLE_PROJECT_CONFIG" = 1 ] && grep -q bluecode "$OPENCODE_CONFIG"; then echo "bluecode/llmfactory:local:GLM-5.3"; fi',
      );
      await expect(
        assertOpencodeReady("bluecode/llmfactory:local:GLM-5.3"),
      ).resolves.toBeUndefined();
      await expect(
        applyThinkingVariant(
          { engine: "opencode", model: "bluecode/llmfactory:local:GLM-5.3" },
          "high",
        ),
      ).resolves.toEqual({ engine: "opencode", model: "bluecode/llmfactory:local:GLM-5.3#high" });
      // a variant the gateway marks disabled is not offered
      const same = { engine: "opencode" as const, model: "bluecode/llmfactory:local:GLM-5.3" };
      await expect(applyThinkingVariant(same, "medium")).resolves.toEqual(same);
      await expect(assertOpencodeReady("bluecode/llmfactory:local:Nope")).rejects.toThrow(
        /BlueCode/,
      );
    } finally {
      await bc.restore();
    }
  });

  describe("applyThinkingVariant (A26)", () => {
    const catalog = JSON.stringify({
      data: [
        {
          providerID: "claude-agent",
          id: "haiku",
          variants: [{ id: "low" }, { id: "medium" }, { id: "high" }],
        },
        { providerID: "opencode", id: "big-pickle", variants: [] },
      ],
    });
    const oc = (model: string) => ({ engine: "opencode" as const, model });

    it("runs the variant matching the thinking level", async () => {
      await fakeBin(`echo '${catalog}'`);
      await expect(applyThinkingVariant(oc("claude-agent/haiku"), "low")).resolves.toEqual(
        oc("claude-agent/haiku#low"),
      );
    });

    it("keeps an explicit #variant, a model without a matching variant, and claude as-is", async () => {
      await fakeBin(`echo '${catalog}'`);
      await expect(applyThinkingVariant(oc("claude-agent/haiku#high"), "low")).resolves.toEqual(
        oc("claude-agent/haiku#high"),
      );
      await expect(applyThinkingVariant(oc("opencode/big-pickle"), "high")).resolves.toEqual(
        oc("opencode/big-pickle"),
      );
      await expect(applyThinkingVariant(oc("claude-agent/haiku"), undefined)).resolves.toEqual(
        oc("claude-agent/haiku"),
      );
      await expect(applyThinkingVariant({ engine: "claude" }, "high")).resolves.toEqual({
        engine: "claude",
      });
    });

    it("an unreadable catalog never fails the run — no variant", async () => {
      await fakeBin("echo not-json");
      await expect(applyThinkingVariant(oc("claude-agent/haiku"), "low")).resolves.toEqual(
        oc("claude-agent/haiku"),
      );
      process.env.OPENCODE_BIN = path.join(dir, "missing");
      clearOpencodeCache();
      await expect(applyThinkingVariant(oc("claude-agent/haiku"), "low")).resolves.toEqual(
        oc("claude-agent/haiku"),
      );
    });
  });
});

describe("resolveRunEngine (todo-7)", () => {
  const config = {
    aiEngine: "opencode" as const,
    opencodeModel: "b/default",
    opencodeTierModels: { haiku: "b/h", sonnet: "b/s", opus: "b/o", fable: "b/missing" },
  };
  let dir: string;
  const saved = process.env.OPENCODE_BIN;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-run-"));
    clearOpencodeCache();
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.OPENCODE_BIN;
    else process.env.OPENCODE_BIN = saved;
    clearOpencodeCache();
    await fs.rm(dir, { recursive: true, force: true });
  });

  /** A fake `opencode` that records each call in `calls` and lists `ids`. */
  async function fakeModels(ids: string[]): Promise<void> {
    const bin = path.join(dir, "opencode");
    const lines = ids.map((id) => `echo "${id}"`).join("\n");
    await fs.writeFile(bin, `#!/bin/sh\necho x >> "${dir}/calls"\n${lines}\n`, { mode: 0o755 });
    process.env.OPENCODE_BIN = bin;
    clearOpencodeCache();
  }
  function fakeModelsFail(): void {
    process.env.OPENCODE_BIN = path.join(dir, "missing");
    clearOpencodeCache();
  }

  it("falls back one tier when the family lacks the asked tier's model", async () => {
    await fakeModels(["b/h", "b/s", "b/o", "b/default"]);
    expect(await resolveRunEngine({ model: "fable" }, config)).toEqual({
      engine: "opencode",
      model: "b/o",
    });
  });

  it("keeps an explicit engineModel even when unlisted", async () => {
    await fakeModels(["b/h"]);
    expect((await resolveRunEngine({ model: "fable", engineModel: "x/pin" }, config)).model).toBe(
      "x/pin",
    );
  });

  it("trusts the mapping when the catalog is unreadable", async () => {
    fakeModelsFail();
    expect((await resolveRunEngine({ model: "fable" }, config)).model).toBe("b/missing");
  });

  it("never probes opencode for a claude run", async () => {
    await fakeModels(["b/h"]);
    expect(await resolveRunEngine({ model: "fable" }, { ...config, aiEngine: "claude" })).toEqual({
      engine: "claude",
    });
    await expect(fs.access(path.join(dir, "calls"))).rejects.toThrow();
  });
});
