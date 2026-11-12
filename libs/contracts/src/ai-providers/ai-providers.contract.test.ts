import { describe, expect, it } from "vitest";
import {
  AgentModelSchema,
  ChatModelSchema,
  SetOpenAiKeyInputSchema,
  SystemConfigSchema,
  aiProvidersContract,
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

describe("model tiers (A19/A20)", () => {
  it("agents / phases / chat share one tier enum incl. fable", () => {
    expect(AgentModelSchema.options).toEqual(["haiku", "sonnet", "opus", "fable"]);
    expect(ChatModelSchema).toBe(AgentModelSchema);
  });

  it("defaults opencodeTierModels to {}", () => {
    expect(SystemConfigSchema.parse({}).opencodeTierModels).toEqual({});
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
