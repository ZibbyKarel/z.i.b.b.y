import { describe, expect, it } from "vitest";
import { AiProvidersUsageSchema } from "@zibby/contracts";
import { freeInCatalog, mapOpencodeStats, markFree, parseProviders } from "./ai-engines.service";

// Shape of `opencode stats --json --days 30 --models` (v2.0.12), values made up.
const STATS = JSON.stringify({
  range: { days: 30 },
  sessions: 4,
  steps: 12,
  tokens: { input: 50000, output: 1200, reasoning: 300, cache: { read: 4000, write: 10 } },
  cost: 0.42,
  tools: { shell: 3 },
  models: [
    {
      model: { id: "big-pickle", providerID: "opencode", variant: null },
      steps: 9,
      tokens: { input: 40000, output: 1000, reasoning: 300, cache: { read: 4000, write: 10 } },
      cost: 0,
    },
    {
      model: { id: "claude-sonnet-4", providerID: "anthropic", variant: "high" },
      steps: 3,
      tokens: { input: 10000, output: 200, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0.42,
    },
  ],
});

describe("mapOpencodeStats", () => {
  it("maps totals and per-model usage onto the contract", () => {
    const usage = mapOpencodeStats(STATS);
    expect(usage.available).toBe(true);
    expect(usage.totals).toEqual({
      steps: 12,
      costUsd: 0.42,
      tokens: { input: 50000, output: 1200, reasoning: 300, cacheRead: 4000, cacheWrite: 10 },
    });
    expect(usage.models).toHaveLength(2);
    expect(usage.models[0]).toMatchObject({
      providerId: "opencode",
      modelId: "big-pickle",
      steps: 9,
    });
    expect(usage.models[0]).not.toHaveProperty("variant");
    expect(usage.models[1]).toMatchObject({
      providerId: "anthropic",
      variant: "high",
      costUsd: 0.42,
    });
    expect(AiProvidersUsageSchema.parse({ days: 30, opencode: usage })).toBeTruthy();
  });

  it("reports unavailable with zeros when opencode can't be read", () => {
    for (const out of [null, "not json"]) {
      const usage = mapOpencodeStats(out);
      expect(usage).toMatchObject({ available: false, models: [] });
      expect(usage.totals.costUsd).toBe(0);
    }
  });
});

describe("parseProviders", () => {
  it("unions logged-in providers with the model prefixes", () => {
    expect(parseProviders("[]", ["opencode/big-pickle"])).toEqual(["opencode"]);
    expect(parseProviders('[{"id":"anthropic"},"openai"]', ["opencode/a"])).toEqual([
      "anthropic",
      "openai",
      "opencode",
    ]);
    expect(parseProviders("garbage", ["x/y"])).toEqual(["x"]);
  });
});

// Shape of `opencode api GET /api/model` (v2.0.12): one priced entry per model.
const price = (n: number) => [{ input: n, output: n, cache: { read: n, write: n } }];
const CATALOG = JSON.stringify({
  data: [
    { id: "big-pickle", providerID: "opencode", cost: price(0) },
    { id: "beam-free", providerID: "opencode", cost: price(0.1) },
    { id: "no-price", providerID: "opencode" },
    { id: "gpt-5", providerID: "openai", cost: price(0) },
    { id: "claude-sonnet-4", providerID: "anthropic", cost: price(3) },
  ],
});

describe("markFree", () => {
  it("is free only for an opencode-provider model whose every catalog price is 0", () => {
    expect(
      markFree(
        [
          "opencode/big-pickle",
          "opencode/beam-free",
          "opencode/no-price",
          "openai/gpt-5",
          "anthropic/claude-sonnet-4",
          "opencode/unlisted-free",
          "opencode/unlisted",
        ],
        freeInCatalog(CATALOG),
      ),
    ).toEqual([
      { id: "opencode/big-pickle", free: true },
      { id: "opencode/beam-free", free: false }, // priced, despite the -free id
      { id: "opencode/no-price", free: false }, // no cost = unknown = not free
      { id: "openai/gpt-5", free: false }, // zero cost but not the opencode provider
      { id: "anthropic/claude-sonnet-4", free: false },
      { id: "opencode/unlisted-free", free: true }, // not in the catalog → id rule
      { id: "opencode/unlisted", free: false },
    ]);
  });

  it("falls back to the opencode -free id rule when the catalog can't be read", () => {
    for (const out of [null, "garbage", '{"data":[]}']) {
      expect(freeInCatalog(out)).toBeNull();
    }
    expect(markFree(["opencode/a-free", "opencode/big-pickle", "openai/x-free"], null)).toEqual([
      { id: "opencode/a-free", free: true },
      { id: "opencode/big-pickle", free: false },
      { id: "openai/x-free", free: false },
    ]);
  });
});
