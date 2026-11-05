import type {
  BudgetStatus,
  InboxEpic,
  InboxPr,
  InboxRoadmapItem,
  PrWidgetFilters,
  RoadmapSourceKind,
  Team,
} from "@zibby/contracts";
import { teamSlugMatches } from "@zibby/contracts";
import { type StateTone, normalizeStateTone } from "@zibby/design-system";
import {
  type InboxFilters,
  ZIBBY_STATUS_RANK,
  type ZibbyStatus,
  chainKey,
  findPr,
  groupByEpic,
  itemKey,
  linkedPrOf,
  pad2,
  passesFilters,
  prAncestors,
  zibbyStatus,
} from "../../inbox/inbox";
import { type RunView, runTitle } from "../../runs/run";
import { buildPhaseNodes } from "../../runs/stagePhases";
import { runStateTone } from "../../runs/run";
import {
  PR_CI_FILTERS,
  PR_REVIEW_FILTERS,
  type PrCiFilter,
  type PrCiState,
  type PrReviewFilter,
  type PrReviewState,
  prApprovalStale,
  prCiState,
  prReviewFilter,
  prReviewState,
} from "./prStatus";

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
  /** Source (Jira) status name; shown instead of the ZIBBY tag for new/running. */
  sourceStatus: string | null;
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
    sourceStatus: item.sourceStatus?.name ?? null,
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

/** A card's tooltip for its review icon — the icon is shared, the wording follows whose PR it is. */
export type PrReviewHint =
  | "reviewMine"
  | "reviewYou"
  | "reviewStale"
  | "approvedYou"
  | "approvedOther"
  | "changesYou"
  | "changes"
  | "waiting";

export interface PrRowVm {
  key: string;
  /** Selection id — the PR url (numbers repeat across repos). */
  id: string;
  number: string;
  title: string;
  age: string;
  /** The author's display name, else the login. */
  author: string;
  avatarUrl: string | undefined;
  /** Repo name without the owner. */
  project: string;
  tone: RowTone;
  ci: PrCiState;
  review: PrReviewState;
  reviewHint: PrReviewHint;
  /** Someone else's PR waiting on my review: the ink ring. */
  needsYou: boolean;
  /** Shown only as stack context for a filter hit above it. */
  muted: boolean;
  /** Unresolved review threads on my PR; 0 for others' PRs or when unknown. */
  conversations: number;
  mine: boolean;
}

/** One card and the PRs stacked directly on it (base -> head). */
export interface PrNodeVm {
  row: PrRowVm;
  kids: PrNodeVm[];
}

/** The operator's pick; same shape as a widget's saved defaults. An empty group doesn't filter. */
export type PrFilterPick = PrWidgetFilters;

export interface PrTeamOption {
  value: string;
  label: string;
}

/**
 * Team filter options: every configured team with a slug (value = slug, label = team name), plus
 * each discovered `reviewTeam` / saved default (`org/team`) no configured slug already covers.
 */
export function prTeams(
  prs: InboxPr[],
  extra: readonly string[] = [],
  configured: readonly Team[] = [],
): PrTeamOption[] {
  const slugs = configured.flatMap((t) => (t.slug ? [{ slug: t.slug, name: t.name }] : []));
  const options = new Map<string, PrTeamOption>(
    slugs.map(({ slug, name }) => [slug, { value: slug, label: name }]),
  );
  const found = [...prs.map((p) => p.reviewTeam), ...extra].filter((t): t is string => !!t);
  for (const team of found)
    if (!slugs.some(({ slug }) => teamSlugMatches(team, slug)))
      options.set(team, { value: team, label: prTeamLabel(team) });
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** `org/team` -> `team`. */
export const prTeamLabel = (slug: string) => slug.split("/").pop() ?? slug;

function prReviewHint(pr: InboxPr, review: PrReviewState): PrReviewHint {
  const mine = pr.bucket === "mine";
  switch (review) {
    case "review":
      return mine ? "reviewMine" : prApprovalStale(pr) ? "reviewStale" : "reviewYou";
    case "approved":
      return mine ? "approvedOther" : "approvedYou";
    case "changes":
      return pr.myReview === "changes-requested" ? "changesYou" : "changes";
    default:
      return "waiting";
  }
}

/** Own PRs colour by what blocks them; others' only by what they ask of me (their CI is theirs). */
function prTone(pr: InboxPr, ci: PrCiState, review: PrReviewState): RowTone {
  if (pr.draft) return "neutral";
  const mine = pr.bucket === "mine";
  if (mine && (ci === "conflict" || ci === "failing")) return "error";
  if (review === "changes") return "blocked";
  if ((!mine && review === "review") || (mine && ci === "running")) return "thinking";
  return review === "approved" ? "done" : "idle";
}

export function prRow(widgetId: string, pr: InboxPr, ago: Ago, muted = false): PrRowVm {
  const ci = prCiState(pr);
  const review = prReviewState(pr);
  const mine = pr.bucket === "mine";
  return {
    key: rowKey(widgetId, pr.url),
    id: pr.url,
    number: `#${pr.number}`,
    title: pr.title,
    age: ago(pr.createdAt),
    author: pr.authorName ?? pr.author,
    avatarUrl: pr.authorAvatarUrl,
    project: pr.repo.split("/")[1] ?? pr.repo,
    tone: prTone(pr, ci, review),
    ci,
    review,
    reviewHint: prReviewHint(pr, review),
    needsYou: !mine && review === "review",
    muted,
    conversations: mine ? (pr.unresolvedThreads ?? 0) : 0,
    mine,
  };
}

const countBy = <K extends string>(keys: readonly K[], list: InboxPr[], of: (p: InboxPr) => K) =>
  Object.fromEntries(keys.map((k) => [k, list.filter((p) => of(p) === k).length])) as Record<
    K,
    number
  >;

/**
 * The Pull requests screen's set (stored filters) as one flat list of stack trees, newest first.
 * `pick` narrows it by review / CI state, mine and review team; a picked PR keeps its listed ancestors as muted
 * context so a stack never loses its middle. Siblings and roots sort by their subtree's newest PR.
 */
export function prTree(
  widgetId: string,
  all: InboxPr[],
  filters: InboxFilters,
  pick: PrFilterPick,
  ago: Ago,
): {
  nodes: PrNodeVm[];
  /** The whole listed set, before `pick`. */
  total: number;
  /** Others' PRs waiting on my review. */
  you: number;
  counts: { review: Record<PrReviewFilter, number>; ci: Record<PrCiFilter, number> };
} {
  const visible = all.filter((p) => passesFilters(filters, p));
  const shown = new Set(visible.map((p) => p.url));
  // AND across groups, OR within one; an empty group doesn't filter.
  const hit = visible.filter(
    (p) =>
      (!pick.review?.length || pick.review.includes(prReviewFilter(prReviewState(p)))) &&
      (!pick.ci?.length || (pick.ci as string[]).includes(prCiState(p))) &&
      (!pick.mine || p.bucket === "mine") &&
      (!pick.teams?.length ||
        (!!p.reviewTeam && pick.teams.some((v) => teamSlugMatches(p.reviewTeam!, v)))),
  );
  const hitUrls = new Set(hit.map((p) => p.url));
  const kept = new Set(hitUrls);
  for (const p of hit) for (const a of prAncestors(p, all)) if (shown.has(a.url)) kept.add(a.url);
  // "Mine only" also keeps what is stacked on my PRs (others' descendants), greyed out.
  if (pick.mine)
    for (const p of visible)
      if (prAncestors(p, all).some((a) => hitUrls.has(a.url))) kept.add(p.url);

  // Each kept PR hangs under its nearest kept ancestor; none = a root.
  const kids = new Map<string, InboxPr[]>();
  const roots: InboxPr[] = [];
  for (const p of visible) {
    if (!kept.has(p.url)) continue;
    const up = prAncestors(p, all)
      .reverse()
      .find((a) => kept.has(a.url));
    if (up) kids.set(up.url, [...(kids.get(up.url) ?? []), p]);
    else roots.push(p);
  }
  const newest = (p: InboxPr): number =>
    Math.max(Date.parse(p.createdAt), ...(kids.get(p.url) ?? []).map(newest));
  const build = (list: InboxPr[]): PrNodeVm[] =>
    [...list]
      .sort((a, b) => newest(b) - newest(a))
      .map((p) => ({
        row: prRow(widgetId, p, ago, !hitUrls.has(p.url)),
        kids: build(kids.get(p.url) ?? []),
      }));

  return {
    nodes: build(roots),
    total: visible.length,
    you: visible.filter((p) => p.bucket !== "mine" && prReviewState(p) === "review").length,
    counts: {
      review: countBy(PR_REVIEW_FILTERS, visible, (p) => prReviewFilter(prReviewState(p))),
      ci: countBy(PR_CI_FILTERS, visible, (p) => prCiState(p) as PrCiFilter),
    },
  };
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
  /** ISO start time — the widget's live elapsed readout. */
  startedAt: string;
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
      startedAt: r.startedAt,
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
