import type { BudgetStatus as BudgetReadout, ProjectBudgetStatus } from "@zibby/contracts";

export type BudgetRowKind = "limit" | "company" | "project";
export type BudgetStatus = "ok" | "near" | "exhausted";
export type BudgetAxis =
  | "daily"
  | "weekly"
  | "monthly"
  | "dailyCost"
  | "weeklyCost"
  | "monthlyCost"
  | "rolling"
  | "weeklyLimit";

export interface BudgetHealthRow {
  kind: BudgetRowKind;
  /** projectId | companyId | "rolling" | "weekly". */
  id: string;
  /** Limit rows: "" (the widget supplies the i18n label). */
  name: string;
  status: BudgetStatus;
  /** Worst ratio; limit rows = usedPct / 100. */
  ratio: number;
  axis: BudgetAxis;
  /** Runs, USD or percent. */
  used: number;
  /** Positive for a capped axis (limit rows = 100); 0 for an uncapped project shown only for held tasks. */
  cap: number;
  held: number;
}

/** A row turns "near" from this share of its cap. */
export const NEAR_RATIO = 0.8;

const AXES = ["daily", "weekly", "monthly", "dailyCost", "weeklyCost", "monthlyCost"] as const;
type ProjectAxis = (typeof AXES)[number];

interface Usage {
  used: number;
  cap?: number;
}

/** Normalizes the run-count and dollar windows of a project to `{used, cap?}` per axis. */
function usageOf(p: ProjectBudgetStatus, axis: ProjectAxis): Usage | undefined {
  switch (axis) {
    case "daily":
    case "weekly":
    case "monthly":
      return p[axis];
    case "dailyCost":
    case "weeklyCost":
    case "monthlyCost": {
      const w = p[axis];
      return w ? { used: w.spentUsd, cap: w.capUsd } : undefined;
    }
  }
}

function statusOf(ratio: number, held: number): BudgetStatus {
  if (ratio >= 1 || held > 0) return "exhausted";
  return ratio >= NEAR_RATIO ? "near" : "ok";
}

/** The worst capped axis of a usage map, or the first axis (uncapped) when nothing is capped. */
function worstAxis(get: (axis: ProjectAxis) => Usage | undefined, held: number) {
  let best: { axis: ProjectAxis; used: number; cap: number; ratio: number } | undefined;
  for (const axis of AXES) {
    const u = get(axis);
    if (u?.cap === undefined || u.cap <= 0) continue;
    const ratio = u.used / u.cap;
    if (!best || ratio > best.ratio) best = { axis, used: u.used, cap: u.cap, ratio };
  }
  if (best) return best;
  if (held <= 0) return undefined;
  return { axis: "daily" as const, used: get("daily")?.used ?? 0, cap: 0, ratio: 0 };
}

function limitRow(
  id: "rolling" | "weekly",
  axis: BudgetAxis,
  usedPct: number,
  g: BudgetReadout["global"],
): BudgetHealthRow {
  const pauseAt = (id === "rolling" ? g.pauseAtRollingPct : g.pauseAtWeeklyPct) ?? 100;
  const warnAt = (id === "rolling" ? g.warnAtRollingPct : g.warnAtWeeklyPct) ?? 80;
  const status: BudgetStatus =
    g.paused || usedPct >= pauseAt ? "exhausted" : usedPct >= warnAt ? "near" : "ok";
  return {
    kind: "limit",
    id,
    name: "",
    status,
    ratio: usedPct / 100,
    axis,
    used: usedPct,
    cap: 100,
    held: 0,
  };
}

const STATUS_ORDER: Record<BudgetStatus, number> = { exhausted: 0, near: 1, ok: 2 };

/**
 * View-model of the Bridge "Budgets & limits" widget: account limits, company rollups and
 * project budgets, each reduced to its worst axis and a status, in display order (limits first,
 * then exhausted > near > ok, higher ratio first, name ascending).
 */
export function buildBudgetRows(input: {
  budget: BudgetReadout;
  projects: ReadonlyArray<{ id: string; companyId?: string | null }>;
  companies: ReadonlyArray<{ id: string; name: string }>;
}): { rows: BudgetHealthRow[]; limitsUnknown: boolean } {
  const { budget, projects, companies } = input;
  const g = budget.global;

  const limits: BudgetHealthRow[] = g.stale
    ? []
    : [
        limitRow("rolling", "rolling", g.rolling.usedPct, g),
        limitRow("weekly", "weeklyLimit", g.weekly.usedPct, g),
      ];

  const others: BudgetHealthRow[] = [];
  for (const p of budget.projects) {
    const w = worstAxis((axis) => usageOf(p, axis), p.held);
    if (!w) continue;
    others.push({
      kind: "project",
      id: p.projectId,
      name: p.name,
      status: statusOf(w.ratio, p.held),
      ratio: w.ratio,
      axis: w.axis,
      used: w.used,
      cap: w.cap,
      held: p.held,
    });
  }

  for (const company of companies) {
    const memberIds = new Set(projects.filter((p) => p.companyId === company.id).map((p) => p.id));
    const members = budget.projects.filter((p) => memberIds.has(p.projectId));
    const held = members.reduce((sum, m) => sum + m.held, 0);
    // Uncapped members contribute to neither side of an axis.
    const rollup = (axis: ProjectAxis): Usage | undefined => {
      let used = 0;
      let cap: number | undefined;
      for (const m of members) {
        const u = usageOf(m, axis);
        if (u?.cap === undefined) continue;
        used += u.used;
        cap = (cap ?? 0) + u.cap;
      }
      return cap === undefined ? undefined : { used, cap };
    };
    const w = worstAxis(rollup, 0);
    if (!w) continue;
    others.push({
      kind: "company",
      id: company.id,
      name: company.name,
      status: statusOf(w.ratio, held),
      ratio: w.ratio,
      axis: w.axis,
      used: w.used,
      cap: w.cap,
      held,
    });
  }

  others.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      b.ratio - a.ratio ||
      a.name.localeCompare(b.name),
  );

  return { rows: [...limits, ...others], limitsUnknown: g.stale };
}
