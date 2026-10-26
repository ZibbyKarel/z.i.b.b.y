import type {
  BudgetStatus,
  InboxEpic,
  InboxPr,
  InboxRoadmapItem,
  RoadmapSourceKind,
} from "@zibby/contracts";
import { type StateTone, normalizeStateTone } from "@zibby/design-system";
import {
  type InboxFilters,
  ZIBBY_STATUS_RANK,
  type ZibbyStatus,
  chainKey,
  findPr,
  groupByEpic,
  groupPrStacks,
  itemKey,
  linkedPrOf,
  pad2,
  parentPr,
  passesFilters,
  prWaits,
  zibbyStatus,
} from "../../inbox/inbox";
import { type RunView, runTitle } from "../../runs/run";
import { buildPhaseNodes } from "../../runs/stagePhases";
import { runStateTone } from "../../runs/run";
import { type PrStatusKey, prStatusKey } from "./prStatus";

/** Row tone = DS state tone, or `neutral` (the `--line2` stripe of a draft PR). */
export type RowTone = StateTone | "neutral";

const rowKey = (widgetId: string, id: string) => `${widgetId}:${id}`;

/** Display name of an issue source — brand-cased; the row's CSS decides caps. */
const SOURCE_NAME: Record<RoadmapSourceKind, string> = {
  jira: "Jira",
  github: "GitHub",
  manual: "Manual",
};

/** Compact age in the board's voice (`2H`, `NOW`). */
export type Ago = (iso: string) => string;

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export const ISSUE_TONE: Record<ZibbyStatus, StateTone> = {
  new: "idle",
  waiting: "blocked",
  running: "working",
  done: "done",
};

export interface IssueRowVm {
  /** `data-rk` — unique on the board. */
  key: string;
  /** Selection id — `chainKey(item)` (`<projectId>/<itemId>`; item ids are project-local). */
  id: string;
  /** `KEY-123` / `#21`. */
  code: string;
  title: string;
  tone: StateTone;
  status: ZibbyStatus;
  /** `YOU · 2H` wait text (waiting items), else null. */
  needsYou: string | null;
  /** Source chip text (`JIRA`, `GITHUB`, `MANUAL`). */
  source: string;
  sourceKind: RoadmapSourceKind;
  project: string;
  /** `#n` of the linked PR, else null. */
  pr: string | null;
  age: string;
}

export interface IssueGroupVm {
  /** `epicClosed` key. */
  key: string;
  epic: InboxEpic | null;
  rows: IssueRowVm[];
  /** `done/total` (or the visible count when the epic has no total). */
  count: string;
  /** 0-100. */
  progress: number;
}

/** Waiting (needs you) -> new -> running -> done, then the most recently updated first. */
export function compareIssues(a: InboxRoadmapItem, b: InboxRoadmapItem): number {
  const rank = (i: InboxRoadmapItem) => {
    const s = zibbyStatus(i);
    return s === "waiting" ? -1 : ZIBBY_STATUS_RANK[s];
  };
  return rank(a) - rank(b) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export function issueRow(
  widgetId: string,
  item: InboxRoadmapItem,
  prs: InboxPr[],
  ago: Ago,
): IssueRowVm {
  const status = zibbyStatus(item);
  const pr = findPr(prs, linkedPrOf(item)) ?? linkedPrOf(item);
  const age = ago(item.updatedAt);
  return {
    key: rowKey(widgetId, chainKey(item)),
    id: chainKey(item),
    code: itemKey(item),
    title: item.name,
    tone: ISSUE_TONE[status],
    status,
    needsYou: status === "waiting" ? age : null,
    source: SOURCE_NAME[item.source.kind],
    sourceKind: item.source.kind,
    project: item.project.name,
    pr: pr ? `#${pr.number}` : null,
    age,
  };
}

/** The same sorted set the Issues screen lists, grouped under its epic (`null` = no epic, last). */
export function issueGroups(
  widgetId: string,
  list: InboxRoadmapItem[],
  epics: InboxEpic[],
  prs: InboxPr[],
  ago: Ago,
): IssueGroupVm[] {
  return groupByEpic([...list].sort(compareIssues), epics).map(({ epic, children }) => {
    const total = epic?.total ?? 0;
    return {
      key: epic?.id ?? "none",
      epic,
      rows: children.map((c) => issueRow(widgetId, c, prs, ago)),
      count: total ? `${pad2(epic?.done ?? 0)}/${pad2(total)}` : pad2(children.length),
      progress: total ? Math.round(((epic?.done ?? 0) / total) * 100) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

export type PrNeed = "review" | "merge" | "fix";

/** What the PR asks of the operator: a pending review, a merge, or (own PR) a blocker to fix. */
export function prNeed(pr: InboxPr): PrNeed | null {
  if (pr.bucket === "to-review" && pr.blocker !== "ready-to-merge") return "review";
  if (pr.bucket !== "mine") return null;
  if (pr.blocker === "ready-to-merge") return "merge";
  return pr.blocker === "awaiting-review" ? null : "fix";
}

export interface PrRowVm {
  key: string;
  /** Selection id — the PR url (numbers repeat across repos). */
  id: string;
  number: string;
  title: string;
  /** `REPO · AUTHOR · AGE` (own PRs read `YOU`). */
  meta: string;
  tone: RowTone;
  statusKey: PrStatusKey;
  need: PrNeed | null;
  needsYou: string | null;
  /** `#parent` when stacked on a listed PR. */
  on: string | null;
  /** `#a, #b` unready ancestors. */
  waits: string | null;
}

export interface PrGroupVm {
  /** Own PRs (`bucket === "mine"`) vs PRs waiting on the operator's review. */
  mine: boolean;
  root: PrRowVm;
  kids: PrRowVm[];
}

const PR_TONE: Record<ReturnType<typeof prStatusKey>, RowTone> = {
  reviewRequested: "thinking",
  draft: "neutral",
  ciFailing: "error",
  mergeConflict: "error",
  changesRequested: "blocked",
  checksRunning: "thinking",
  approved: "working",
  awaitingReview: "idle",
};

export function prRow(widgetId: string, pr: InboxPr, all: InboxPr[], ago: Ago): PrRowVm {
  const statusKey = prStatusKey(pr);
  const need = prNeed(pr);
  const parent = parentPr(pr, all);
  const waits = prWaits(pr, all);
  return {
    key: rowKey(widgetId, pr.url),
    id: pr.url,
    number: `#${pr.number}`,
    title: pr.title,
    meta: [
      pr.repo.split("/")[1] ?? pr.repo,
      pr.bucket === "mine" ? "YOU" : pr.author,
      ago(pr.createdAt),
    ].join(" · "),
    tone: PR_TONE[statusKey],
    statusKey,
    need,
    needsYou: need ? ago(pr.updatedAt ?? pr.createdAt) : null,
    on: parent ? `#${parent.number}` : null,
    waits: waits.length ? waits.map((w) => `#${w.number}`).join(", ") : null,
  };
}

/** The Pull requests screen's set (unfiltered list for stack relations, filtered for display), grouped by stack. */
export function prGroups(
  widgetId: string,
  all: InboxPr[],
  filters: InboxFilters,
  ago: Ago,
): { groups: PrGroupVm[]; visible: InboxPr[] } {
  const visible = all.filter((p) => passesFilters(filters, p));
  const groups = groupPrStacks(all, visible).map((g) => ({
    mine: g.root.bucket === "mine",
    root: prRow(widgetId, g.root, all, ago),
    kids: g.kids.map((k) => prRow(widgetId, k, all, ago)),
  }));
  // Own PRs first; the sort is stable, so the urgency order within each section is kept.
  groups.sort((a, b) => Number(b.mine) - Number(a.mine));
  return { groups, visible };
}

// ---------------------------------------------------------------------------
// Running now
// ---------------------------------------------------------------------------

export interface RunRowVm {
  key: string;
  runId: string;
  /** The task the run belongs to — null for a run without one (nothing to open). */
  id: string | null;
  title: string;
  /** `PROCESSOR · STAGE`. */
  step: string;
  tone: StateTone;
  status: RunView["status"];
  /** Completed / total workflow phases — null when the run has no phase list. */
  stages: RunStages | null;
  /** 0-100 stage percentage for workflows; null = indeterminate. */
  pct: number | null;
  /** Roadmap item label (`ZB-12`) — null when the run has no issue. */
  issue: string | null;
  /** Fallback right-hand text when there is no issue: the project. */
  project: string;
}

export interface RunStages {
  done: number;
  total: number;
}

/** Phases done / total, counted like the run-detail stage rail; null for non-workflows or 0 phases. */
export function runStages(run: RunView, definedPhaseIds: string[] | undefined): RunStages | null {
  if (run.kind !== "workflow") return null;
  const nodes = buildPhaseNodes(
    run.stageRuns,
    run.currentStage,
    run.status === "running",
    definedPhaseIds,
  );
  if (nodes.length === 0) return null;
  return { done: nodes.filter((n) => n.main?.status === "done").length, total: nodes.length };
}

export function runRows(
  widgetId: string,
  runs: RunView[],
  phasesByWorkflow?: ReadonlyMap<string, string[]>,
): RunRowVm[] {
  return runs.map((r) => {
    const stages = runStages(r, phasesByWorkflow?.get(r.owner));
    const stage = r.currentStage ?? r.processor?.kind ?? r.kind;
    return {
      key: rowKey(widgetId, r.runId),
      runId: r.runId,
      id: r.taskId ?? null,
      title: runTitle(r),
      step: [r.processor?.name ?? r.owner, stage].filter(Boolean).join(" · "),
      tone: normalizeStateTone(runStateTone(r.status) ?? "idle"),
      status: r.status,
      stages,
      pct: stages ? Math.round((stages.done / stages.total) * 100) : null,
      issue: r.roadmapItemLabel ?? null,
      project: r.projectId ?? r.project,
    };
  });
}

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

/** Today's spend in USD: the sum of the projects' daily cost windows (0 when none reported). */
export function spendTodayUsd(budget: BudgetStatus | undefined): number {
  return (budget?.projects ?? []).reduce((sum, p) => sum + (p.dailyCost?.spentUsd ?? 0), 0);
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
