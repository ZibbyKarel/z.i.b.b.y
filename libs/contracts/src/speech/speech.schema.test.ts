import { describe, expect, it } from "vitest";
import { SpeechSynthesizeInputSchema } from "./speech.schema";

describe("SpeechSynthesizeInputSchema.text (T11 finding #32)", () => {
  it("accepts a well-formed request", () => {
    expect(SpeechSynthesizeInputSchema.safeParse({ text: "ahoj" }).success).toBe(true);
  });

  it("rejects an empty text", () => {
    expect(SpeechSynthesizeInputSchema.safeParse({ text: "" }).success).toBe(false);
  });

  it("caps text at 8000 chars (audit's own anchor): 8000 passes, 8001 rejects", () => {
    expect(SpeechSynthesizeInputSchema.safeParse({ text: "x".repeat(8000) }).success).toBe(true);
    expect(SpeechSynthesizeInputSchema.safeParse({ text: "x".repeat(8001) }).success).toBe(false);
  });
});
