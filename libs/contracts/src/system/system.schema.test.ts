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

describe("BridgeWidgetSchema title and prFilters", () => {
  it("accepts a trimmed title and pr filters", () => {
    const w = BridgeWidgetSchema.parse({
      ...base,
      type: "prs",
      title: "  Mine  ",
      prFilters: { review: ["waiting"], ci: [], mine: true, teams: ["devrel"] },
    });
    expect(w.title).toBe("Mine");
    expect(w.prFilters?.review).toEqual(["waiting"]);
  });

  it("rejects an empty or over-long title", () => {
    expect(BridgeWidgetSchema.safeParse({ ...base, type: "prs", title: "  " }).success).toBe(false);
    expect(
      BridgeWidgetSchema.safeParse({ ...base, type: "prs", title: "x".repeat(61) }).success,
    ).toBe(false);
  });

  it("parses the legacy mine flag and the owner enum, rejects other owners", () => {
    const parse = (prFilters: unknown) =>
      BridgeWidgetSchema.safeParse({ ...base, type: "prs", prFilters }).success;
    expect(parse({ mine: true })).toBe(true);
    expect(parse({ owner: "others" })).toBe(true);
    expect(parse({ owner: "mine" })).toBe(true);
    expect(parse({ owner: "x" })).toBe(false);
  });

  it("rejects an unknown filter value or key", () => {
    expect(
      BridgeWidgetSchema.safeParse({ ...base, type: "prs", prFilters: { review: ["nope"] } })
        .success,
    ).toBe(false);
    expect(
      BridgeWidgetSchema.safeParse({ ...base, type: "prs", prFilters: { extra: 1 } }).success,
    ).toBe(false);
  });
});
