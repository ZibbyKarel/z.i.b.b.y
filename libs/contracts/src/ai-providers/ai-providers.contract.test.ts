import { describe, expect, it } from "vitest";
import {
  AgentModelSchema,
  ChatModelSchema,
  MODEL_FAMILIES,
  SetBlueCodeInputSchema,
  SetOpenAiKeyInputSchema,
  SystemConfigSchema,
  aiProvidersContract,
  applyModelFamily,
  resolveTierModel,
} from "../index";

describe("aiProvidersContract", () => {
  it("exposes get/put/delete under /api", () => {
    expect(aiProvidersContract.getAiProviders.path).toBe("/api/ai-providers");
    expect(aiProvidersContract.setOpenAiKey.method).toBe("PUT");
    expect(aiProvidersContract.clearOpenAiKey.method).toBe("DELETE");
  });

  it("validates the OpenAI key: trimmed, sk- prefix, min 20", () => {
    const key = `sk-${"a".repeat(20)}`;
    expect(SetOpenAiKeyInputSchema.parse({ apiKey: `  ${key} ` }).apiKey).toBe(key);
    expect(SetOpenAiKeyInputSchema.safeParse({ apiKey: "sk-short" }).success).toBe(false);
    expect(SetOpenAiKeyInputSchema.safeParse({ apiKey: "x".repeat(30) }).success).toBe(false);
  });
});

describe("BlueCode (A34)", () => {
  it("is a model family with its own preset and routes", () => {
    expect(MODEL_FAMILIES).toContain("bluecode");
    expect(applyModelFamily("bluecode", undefined)).toMatchObject({
      modelFamily: "bluecode",
      opencodeModel: "bluecode/llmfactory:local:GLM-5.3",
      opencodeTierModels: { haiku: "bluecode/llmfactory:local:GLM-5.3-Flash" },
    });
    expect(aiProvidersContract.setBlueCode.path).toBe("/api/ai-providers/bluecode");
    expect(aiProvidersContract.clearBlueCode.method).toBe("DELETE");
  });

  it("normalises the base URL (https only, no trailing slash) and keeps the key optional", () => {
    const ok = SetBlueCodeInputSchema.parse({ baseUrl: " https://x.test/projects/1/v1/ " });
    expect(ok).toEqual({ baseUrl: "https://x.test/projects/1/v1" });
    expect(SetBlueCodeInputSchema.safeParse({ baseUrl: "http://x.test/v1" }).success).toBe(false);
    for (const raw of ["https://x.test/p/v1?", "https://x.test/p/v1#", "https://x.test/p/v1/"])
      expect(SetBlueCodeInputSchema.parse({ baseUrl: raw }).baseUrl).toBe("https://x.test/p/v1");
    expect(SetBlueCodeInputSchema.safeParse({ baseUrl: "https://x.test/projects/1" }).success).toBe(
      false,
    );
    for (const bad of ["https://u:p@x.test/v1", "https://x.test/v1?a=1", "https://x.test/v1#f"])
      expect(SetBlueCodeInputSchema.safeParse({ baseUrl: bad }).success).toBe(false);
    expect(
      SetBlueCodeInputSchema.safeParse({ baseUrl: "https://x.test", apiKey: "short" }).success,
    ).toBe(false);
  });
});

describe("model tiers (A19/A20)", () => {
  it("agents / phases / chat share one tier enum incl. fable", () => {
    expect(AgentModelSchema.options).toEqual(["haiku", "sonnet", "opus", "fable"]);
    expect(ChatModelSchema).toBe(AgentModelSchema);
  });

  it("defaults to opencode on the Claude family (A31)", () => {
    const c = SystemConfigSchema.parse({});
    expect(c.aiEngine).toBe("opencode");
    expect(c.modelFamily).toBe("claude");
    expect(c.opencodeModel).toBe("claude-agent/sonnet");
    expect(c.opencodeTierModels.fable).toBe("claude-agent/fable");
  });

  it("applyModelFamily filters the preset against the catalog (A31)", () => {
    const all = applyModelFamily("opencode", undefined); // unreadable catalog: written as is
    expect(all).toMatchObject({ aiEngine: "opencode", modelFamily: "opencode" });
    expect(Object.keys(all.opencodeTierModels)).toHaveLength(4);
    const part = applyModelFamily("opencode", [
      "opencode/nemotron-3.5-lightning-free",
      "opencode/minimax-m3.1-flash-free",
    ]);
    expect(part.opencodeTierModels).toEqual({
      haiku: "opencode/nemotron-3.5-lightning-free",
      opus: "opencode/minimax-m3.1-flash-free",
    }); // missing ids unset, never invented
    expect(part.opencodeModel).toBe("opencode/nemotron-3.5-lightning-free"); // default missing -> resolved tier 2
    expect(applyModelFamily("openai", ["claude-agent/haiku"])).toMatchObject({
      opencodeModel: "",
      opencodeTierModels: {},
    });
  });

  it("resolves own tier → nearest lower → nearest higher → fallback", () => {
    const m = { sonnet: "a/s", fable: "a/f" };
    expect(resolveTierModel("sonnet", m, "g")).toBe("a/s");
    expect(resolveTierModel("opus", m, "g")).toBe("a/s"); // lower first
    expect(resolveTierModel("haiku", m, "g")).toBe("a/s"); // no lower → higher
    expect(resolveTierModel("haiku", { opus: "a/o", fable: "a/f" }, "g")).toBe("a/o"); // nearest higher
    expect(resolveTierModel("fable", m, "g")).toBe("a/f");
    expect(resolveTierModel("opus", {}, "g")).toBe("g");
    expect(resolveTierModel(undefined, m, "g")).toBe("g");
    expect(resolveTierModel("opus", undefined, "")).toBe("");
  });
});
