import { describe, expect, it } from "vitest";
import { ChatToolEventSchema } from "./chat.schema";

describe("ChatToolEventSchema.name (T11 finding #7)", () => {
  const base = { name: "create_task", status: "ok" as const };

  it("accepts a well-formed tool event", () => {
    expect(ChatToolEventSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(ChatToolEventSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("caps name at 256 chars: 256 passes, 257 rejects", () => {
    expect(ChatToolEventSchema.safeParse({ ...base, name: "x".repeat(256) }).success).toBe(true);
    expect(ChatToolEventSchema.safeParse({ ...base, name: "x".repeat(257) }).success).toBe(false);
  });
});
