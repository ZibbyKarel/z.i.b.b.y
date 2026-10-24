import type { BudgetStatus as BudgetReadout } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { buildBudgetRows } from "./budgetHealth";

type Project = BudgetReadout["projects"][number];

const limits = (over: Partial<BudgetReadout["global"]> = {}): BudgetReadout["global"] => ({
  rolling: { usedPct: 10, resetsAt: null },
  weekly: { usedPct: 10, resetsAt: null },
  stale: false,
  paused: false,
  ...over,
});

const project = (id: string, over: Partial<Project> = {}): Project => ({
  projectId: id,
  name: id,
  daily: { used: 0 },
  weekly: { used: 0 },
  running: 0,
  queued: 0,
  held: 0,
  ...over,
});

const build = (
  projects: Project[],
  opts: {
    global?: Partial<BudgetReadout["global"]>;
    links?: { id: string; companyId?: string | null }[];
    companies?: { id: string; name: string }[];
  } = {},
) =>
  buildBudgetRows({
    budget: { global: limits(opts.global), projects },
    projects: opts.links ?? projects.map((p) => ({ id: p.projectId })),
    companies: opts.companies ?? [],
  });

const only = (projects: Project[]) =>
  build(projects, { global: { stale: true } }).rows.filter((r) => r.kind === "project");

describe("buildBudgetRows - project status", () => {
  it.each([
    [7, "ok"],
    [8, "near"],
    [10, "exhausted"],
  ])("daily %i/10 is %s", (used, status) => {
    const [row] = only([project("a", { daily: { used, cap: 10 } })]);
    expect(row?.status).toBe(status);
    expect(row?.axis).toBe("daily");
    expect(row?.used).toBe(used);
    expect(row?.cap).toBe(10);
  });

  it("an uncapped project with held tasks is exhausted on the daily axis", () => {
    const [row] = only([project("a", { daily: { used: 3 }, held: 2 })]);
    expect(row).toMatchObject({ status: "exhausted", axis: "daily", used: 3, held: 2 });
  });

  it("names the worst axis", () => {
    const [row] = only([
      project("a", {
        daily: { used: 1, cap: 10 },
        monthlyCost: { spentUsd: 45, capUsd: 50 },
      }),
    ]);
    expect(row).toMatchObject({
      axis: "monthlyCost",
      ratio: 0.9,
      status: "near",
      used: 45,
      cap: 50,
    });
  });

  it("omits a project with no caps and nothing held", () => {
    expect(only([project("a", { daily: { used: 4 } })])).toEqual([]);
  });
});

describe("buildBudgetRows - company rollup", () => {
  const companies = [{ id: "c1", name: "Acme" }];
  const links = [
    { id: "a", companyId: "c1" },
    { id: "b", companyId: "c1" },
  ];

  it("an uncapped member contributes to neither side", () => {
    const { rows } = build(
      [
        project("a", { daily: { used: 5, cap: 10 } }),
        project("b", { daily: { used: 7 }, held: 1 }),
      ],
      { links, companies, global: { stale: true } },
    );
    const company = rows.find((r) => r.kind === "company");
    expect(company).toMatchObject({
      id: "c1",
      name: "Acme",
      axis: "daily",
      used: 5,
      cap: 10,
      held: 1,
      status: "exhausted",
    });
  });

  it("omits a company with no capped members", () => {
    const { rows } = build([project("a", { daily: { used: 5 } })], {
      links,
      companies,
      global: { stale: true },
    });
    expect(rows.find((r) => r.kind === "company")).toBeUndefined();
  });
});

describe("buildBudgetRows - account limits", () => {
  const limitRows = (g: Partial<BudgetReadout["global"]>) =>
    build([], { global: g }).rows.filter((r) => r.kind === "limit");

  it("85% with no warn threshold is near", () => {
    const [rolling] = limitRows({ rolling: { usedPct: 85, resetsAt: null } });
    expect(rolling).toMatchObject({
      id: "rolling",
      axis: "rolling",
      name: "",
      status: "near",
      ratio: 0.85,
      used: 85,
      cap: 100,
    });
  });

  it("honours the warn threshold", () => {
    const [rolling] = limitRows({
      rolling: { usedPct: 50, resetsAt: null },
      warnAtRollingPct: 40,
    });
    expect(rolling?.status).toBe("near");
  });

  it("reaching the pause threshold is exhausted", () => {
    const rows = limitRows({
      weekly: { usedPct: 70, resetsAt: null },
      pauseAtWeeklyPct: 70,
    });
    expect(rows[1]).toMatchObject({ id: "weekly", axis: "weeklyLimit", status: "exhausted" });
  });

  it("paused makes both exhausted", () => {
    expect(limitRows({ paused: true }).map((r) => r.status)).toEqual(["exhausted", "exhausted"]);
  });

  it("stale hides the limits and flags them unknown", () => {
    const out = build([], { global: { stale: true } });
    expect(out.rows).toEqual([]);
    expect(out.limitsUnknown).toBe(true);
  });

  it("fresh limits are not unknown", () => {
    expect(build([]).limitsUnknown).toBe(false);
  });
});

describe("buildBudgetRows - order", () => {
  it("limits first, then exhausted, near, ok; ratio desc then name asc", () => {
    const { rows } = build(
      [
        project("ok", { name: "Ok", daily: { used: 1, cap: 10 } }),
        project("nearB", { name: "B", daily: { used: 8, cap: 10 } }),
        project("nearA", { name: "A", daily: { used: 8, cap: 10 } }),
        project("nearHi", { name: "Z", daily: { used: 9, cap: 10 } }),
        project("full", { name: "Full", daily: { used: 10, cap: 10 } }),
      ],
      { global: { rolling: { usedPct: 5, resetsAt: null } } },
    );
    expect(rows.map((r) => r.id)).toEqual([
      "rolling",
      "weekly",
      "full",
      "nearHi",
      "nearA",
      "nearB",
      "ok",
    ]);
  });
});
