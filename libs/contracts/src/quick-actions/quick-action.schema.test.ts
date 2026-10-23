import { describe, expect, it } from "vitest";
import { QuickActionSchema, QuickActionsSchema } from "./quick-action.schema";

const base = { id: "a", label: "Deploy", text: "Run deploy" };

describe("QuickActionSchema", () => {
  it("accepts an action without a target", () => {
    expect(QuickActionSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an agent target", () => {
    const target = { kind: "agent", id: "coder", name: "Kodér" };
    expect(QuickActionSchema.safeParse({ ...base, target }).success).toBe(true);
  });

  it("rejects a whitespace-only label", () => {
    expect(QuickActionSchema.safeParse({ ...base, label: "   " }).success).toBe(false);
  });

  it("rejects a whitespace-only text", () => {
    expect(QuickActionSchema.safeParse({ ...base, text: "   " }).success).toBe(false);
  });

  it("rejects a goal target", () => {
    const target = { kind: "goal", id: "g", name: "G" };
    expect(QuickActionSchema.safeParse({ ...base, target }).success).toBe(false);
  });
});

describe("QuickActionsSchema", () => {
  it("rejects more than 50 items", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ ...base, id: `a${i}` }));
    expect(QuickActionsSchema.safeParse(items).success).toBe(false);
    expect(QuickActionsSchema.safeParse(items.slice(0, 50)).success).toBe(true);
  });
});
