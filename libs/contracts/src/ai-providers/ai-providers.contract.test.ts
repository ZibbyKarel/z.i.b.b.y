import { describe, expect, it } from "vitest";
import { SetOpenAiKeyInputSchema, aiProvidersContract } from "../index";

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
