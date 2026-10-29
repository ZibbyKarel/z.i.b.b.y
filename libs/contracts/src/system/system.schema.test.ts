import { describe, expect, it } from "vitest";
import { BridgeWidgetSchema } from "./system.schema";

const base = { id: "w1", x: 0, y: 0, w: 4, h: 6 };

describe("BridgeWidgetSchema scope", () => {
  it("accepts a proposals widget", () => {
    expect(BridgeWidgetSchema.safeParse({ ...base, type: "proposals" }).success).toBe(true);
  });

  it("accepts a mentions widget", () => {
    expect(BridgeWidgetSchema.safeParse({ ...base, type: "mentions" }).success).toBe(true);
  });

  it("accepts a budgets widget", () => {
    expect(BridgeWidgetSchema.safeParse({ ...base, type: "budgets" }).success).toBe(true);
  });

  it("accepts a teamKb widget scoped to a team", () => {
    const w = BridgeWidgetSchema.parse({ ...base, type: "teamKb", scope: { teamId: "devrel" } });
    expect(w.scope).toEqual({ teamId: "devrel" });
  });

  it("accepts an old widget without scope", () => {
    expect(BridgeWidgetSchema.parse({ ...base, type: "todo" }).scope).toBeUndefined();
  });

  it("rejects an unknown key in scope", () => {
    expect(
      BridgeWidgetSchema.safeParse({ ...base, type: "teamKb", scope: { teamId: "a", x: 1 } })
        .success,
    ).toBe(false);
  });
});
