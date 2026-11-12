import { describe, expect, it } from "vitest";
import { BridgeWidgetSchema, SystemConfigSchema, UiSettingsSchema } from "./system.schema";

const base = { id: "w1", x: 0, y: 0, w: 4, h: 6 };

describe("BridgeWidgetSchema scope", () => {
  it("accepts a proposals widget", () => {
    expect(BridgeWidgetSchema.safeParse({ ...base, type: "proposals" }).success).toBe(true);
  });

  it("accepts an automationRuns widget (todo-11)", () => {
    expect(BridgeWidgetSchema.safeParse({ ...base, type: "automationRuns" }).success).toBe(true);
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

describe("BridgeWidgetSchema title and filters", () => {
  it("accepts a trimmed title and migrates legacy prFilters to filters", () => {
    const w = BridgeWidgetSchema.parse({
      ...base,
      type: "prs",
      title: "  Mine  ",
      prFilters: { review: ["waiting"], ci: [], mine: true, teams: ["devrel"] },
    });
    expect(w.title).toBe("Mine");
    expect(w.filters?.review).toEqual(["waiting"]);
    expect(w).not.toHaveProperty("prFilters");
  });

  it("accepts company and team filters; filters win over a stale prFilters", () => {
    const w = BridgeWidgetSchema.parse({
      ...base,
      type: "issues",
      filters: { companies: ["shoptet"], teams: ["devrel"] },
      prFilters: { owner: "mine" },
    });
    expect(w.filters).toEqual({ companies: ["shoptet"], teams: ["devrel"] });
    expect(w).not.toHaveProperty("prFilters");
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

describe("removed widget types in saved layouts (todo-16)", () => {
  const tasks = { ...base, id: "tasks", type: "tasks" };
  const runs = { ...base, id: "runs", type: "runs" };

  it("drops a removed `tasks` widget from the layout and saved layouts, keeping the rest", () => {
    const ui = UiSettingsSchema.parse({
      bridge: { layout: [tasks, runs], saved: { Reviews: [runs, tasks] } },
    });
    expect(ui.bridge.layout?.map((w) => w.type)).toEqual(["runs"]);
    expect(ui.bridge.saved["Reviews"]?.map((w) => w.type)).toEqual(["runs"]);
  });

  it("a whole system config with a stale `tasks` widget still parses", () => {
    const parsed = SystemConfigSchema.safeParse({ ui: { bridge: { layout: [tasks] } } });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a single `tasks` widget", () => {
    expect(BridgeWidgetSchema.safeParse(tasks).success).toBe(false);
  });
});
