import {
  INBOX_PR_BLOCKERS,
  INBOX_PR_SECTIONS,
  type InboxEpic,
  type InboxPr,
  type InboxPrBlocker,
  type InboxPrSection,
  type InboxRoadmapItem,
} from "@zibby/contracts";

/**
 * Pure Inbox logic (docs/plans/inbox-ui-spec.md): ZIBBY's execution status of a
 * roadmap item, ordering, filtering, search, epic grouping and the global
 * counters. No React, no I/O — everything the screens render is derived here.
 */

/** ZIBBY's view of an item — drives the sort order and the primary action. */
export type ZibbyStatus = "new" | "waiting" | "running" | "done";

/** Sort rank: who is on the move first — new in source, waiting for you, running, done. */
export const ZIBBY_STATUS_RANK: Record<ZibbyStatus, number> = {
  new: 0,
  waiting: 1,
  running: 2,
  done: 3,
};

/**
 * Lifecycle → status. `external` (a colleague works on it outside ZIBBY) reads as
 * running: it is in flight and ZIBBY will not dispatch it. `archived` never
 * reaches the list ({@link isListable}); it maps to done for completeness.
 */
export function zibbyStatus(item: Pick<InboxRoadmapItem, "lifecycle">): ZibbyStatus {
  switch (item.lifecycle) {
    case "todo":
      return "new";
    case "failed":
    case "awaiting-merge":
      return "waiting";
    case "enqueued":
    case "running":
    case "external":
      return "running";
    case "done":
    case "archived":
      return "done";
  }
}

/** ZIBBY finished the item but the source still lists it as open — drift made visible. */
export function differsFromSource(
  item: Pick<InboxRoadmapItem, "lifecycle" | "sourceStatus">,
): boolean {
  return item.lifecycle === "done" && !!item.sourceStatus && !item.sourceStatus.done;
}

/** An item with an actionable status (the "need you" bucket of the counters). */
export function isActionable(item: InboxRoadmapItem): boolean {
  if (item.hidden || !isListable(item)) return false;
  const status = zibbyStatus(item);
  return status === "new" || status === "waiting";
}

/** Archived items (the source stopped returning them) never show in the Inbox. */
export function isListable(item: Pick<InboxRoadmapItem, "lifecycle">): boolean {
  return item.lifecycle !== "archived";
}

/** The source key shown on a row (`KEY-123` / `#21`), falling back to the item id. */
export function itemKey(item: Pick<InboxRoadmapItem, "id" | "source">): string {
  return item.source.externalKey ?? item.id;
}

/** New → waiting → running → done, then the most recently updated first. */
export function compareItems(a: InboxRoadmapItem, b: InboxRoadmapItem): number {
  return (
    ZIBBY_STATUS_RANK[zibbyStatus(a)] - ZIBBY_STATUS_RANK[zibbyStatus(b)] ||
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Option value standing for "no company" / "no team". */
export const NONE_OPTION = "__none";

/** Multi-select per dimension; an empty dimension means "all". */
export interface InboxFilters {
  company: string[];
  team: string[];
  project: string[];
}

export const EMPTY_INBOX_FILTERS: InboxFilters = { company: [], team: [], project: [] };

export function hasInboxFilters(f: InboxFilters): boolean {
  return f.company.length + f.team.length + f.project.length > 0;
}

/** The slice of an item / PR the filters look at. */
export interface InboxScope {
  projectId: string;
  companyId?: string | undefined;
  teamId?: string | undefined;
}

export function itemScope(item: InboxRoadmapItem): InboxScope {
  return { projectId: item.project.id, companyId: item.companyId, teamId: item.teamId };
}

/** AND across dimensions, OR within one; `NONE_OPTION` matches "no company / no team". */
export function passesFilters(f: InboxFilters, scope: InboxScope): boolean {
  return (
    (f.company.length === 0 || f.company.includes(scope.companyId ?? NONE_OPTION)) &&
    (f.team.length === 0 || f.team.includes(scope.teamId ?? NONE_OPTION)) &&
    (f.project.length === 0 || f.project.includes(scope.projectId))
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Case- and diacritics-insensitive form used for search matching. */
export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** `query` is already normalized + trimmed; empty matches everything. */
export function matchesSearch(item: InboxRoadmapItem, query: string): boolean {
  if (!query) return true;
  return normalizeSearch(`${item.name} ${item.description} ${itemKey(item)}`).includes(query);
}

// ---------------------------------------------------------------------------
// Issues list
// ---------------------------------------------------------------------------

export interface IssueListOptions {
  filters: InboxFilters;
  /** Raw search text (normalized here). */
  search: string;
  showDone: boolean;
  showHidden: boolean;
}

/** The visible, sorted issue list for the current filters / toggles / search. */
export function visibleItems(
  items: InboxRoadmapItem[],
  opts: IssueListOptions,
): InboxRoadmapItem[] {
  const q = normalizeSearch(opts.search.trim());
  return items
    .filter(
      (item) =>
        isListable(item) &&
        passesFilters(opts.filters, itemScope(item)) &&
        (opts.showHidden || !item.hidden) &&
        (opts.showDone || zibbyStatus(item) !== "done") &&
        matchesSearch(item, q),
    )
    .sort(compareItems);
}

/** How many hidden items the "Show hidden · NN" toggle would reveal (filters apply). */
export function hiddenCount(items: InboxRoadmapItem[], filters: InboxFilters): number {
  return items.filter(
    (item) => isListable(item) && item.hidden && passesFilters(filters, itemScope(item)),
  ).length;
}

export interface EpicGroup {
  /** `null` is the trailing "No epic" section. */
  epic: InboxEpic | null;
  children: InboxRoadmapItem[];
}

/**
 * Groups an already filtered + sorted list under its epic. Epics come out in the
 * order of their best child (the input is sorted, so first appearance wins);
 * children keep the input order; an epic without a visible child never appears;
 * items with no (or an unknown) epic go to a final `epic: null` group.
 */
export function groupByEpic(items: InboxRoadmapItem[], epics: InboxEpic[]): EpicGroup[] {
  const epicById = new Map(epics.map((e) => [e.id, e]));
  const groups = new Map<string, EpicGroup>();
  const loose: InboxRoadmapItem[] = [];
  for (const item of items) {
    const epic = item.parentId ? epicById.get(item.parentId) : undefined;
    if (!epic) {
      loose.push(item);
      continue;
    }
    const group = groups.get(epic.id);
    if (group) group.children.push(item);
    else groups.set(epic.id, { epic, children: [item] });
  }
  return [...groups.values(), ...(loose.length ? [{ epic: null, children: loose }] : [])];
}

/** Epic header counter: how many of its visible children are new in source. */
export function newCount(children: InboxRoadmapItem[]): number {
  return children.filter((c) => zibbyStatus(c) === "new").length;
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

/** Blockers that make one of MY pull requests need attention. */
export const MINE_BLOCKERS: readonly InboxPrBlocker[] = [
  "ci-failing",
  "changes-requested",
  "merge-conflict",
];

export function isMineBlocked(pr: InboxPr): boolean {
  return pr.bucket === "mine" && MINE_BLOCKERS.includes(pr.blocker);
}

/** Blocker order (`INBOX_PR_BLOCKERS` IS the sort order), then oldest first. */
export function comparePrs(a: InboxPr, b: InboxPr): number {
  return (
    INBOX_PR_BLOCKERS.indexOf(a.blocker) - INBOX_PR_BLOCKERS.indexOf(b.blocker) ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
}

export interface InboxPrBuckets {
  toReview: InboxPr[];
  mine: InboxPr[];
}

/** Filtered + sorted PRs split into the two page sections. */
export function splitPrs(prs: InboxPr[], filters: InboxFilters): InboxPrBuckets {
  const passing = prs.filter((pr) => passesFilters(filters, pr)).sort(comparePrs);
  return {
    toReview: passing.filter((pr) => pr.bucket === "to-review"),
    mine: passing.filter((pr) => pr.bucket === "mine"),
  };
}

/** Phase 129 P1 — filtered + sorted PRs per GitHub-style section (`INBOX_PR_SECTIONS` order). */
export function groupPrsBySection(
  prs: InboxPr[],
  filters: InboxFilters,
): Record<InboxPrSection, InboxPr[]> {
  const groups = Object.fromEntries(INBOX_PR_SECTIONS.map((s) => [s, [] as InboxPr[]])) as Record<
    InboxPrSection,
    InboxPr[]
  >;
  for (const pr of prs.filter((p) => passesFilters(filters, p)).sort(comparePrs)) {
    groups[pr.section].push(pr);
  }
  return groups;
}

/** A PR an item points at: the synced `linkedPr`, else the latest run that opened one. */
export interface ItemPrRef {
  number: number;
  url: string;
  title?: string | undefined;
}

export function linkedPrOf(item: InboxRoadmapItem): ItemPrRef | null {
  if (item.linkedPr) return item.linkedPr;
  const run = [...item.runs]
    .filter((r) => r.prNumber !== undefined && r.prUrl !== undefined)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  return run?.prNumber !== undefined && run.prUrl !== undefined
    ? { number: run.prNumber, url: run.prUrl }
    : null;
}

/** Pull requests page focused on one PR. Keyed by url: PR numbers repeat across repos. */
export function prListHref(url: string): string {
  return `/dashboard/inbox/pull-requests?pr=${encodeURIComponent(url)}`;
}

/** todo-13 — the PRs this one is stacked on (`on`) and the PRs stacked on it (`by`). */
export interface PrChain {
  on: InboxPr[];
  by: InboxPr[];
}

/**
 * Stacked PRs: B is on A when they share a repo and B's base branch is A's head branch.
 * One level each way (A–B–C reads card by card), keyed by url; PRs without a link are absent.
 */
// ponytail: O(n²) over the operator's open PRs, which number in the tens. Index by `repo#headRef` if that ever grows.
export function prChains(prs: InboxPr[]): Map<string, PrChain> {
  const chains = new Map<string, PrChain>();
  const chainOf = (pr: InboxPr) => {
    let chain = chains.get(pr.url);
    if (!chain) chains.set(pr.url, (chain = { on: [], by: [] }));
    return chain;
  };
  for (const child of prs) {
    if (!child.baseRef) continue;
    for (const parent of prs) {
      if (parent === child || parent.repo !== child.repo || parent.headRef !== child.baseRef)
        continue;
      chainOf(child).on.push(parent);
      chainOf(parent).by.push(child);
    }
  }
  return chains;
}

/** todo-14 — the issues blocking this one (`on`) and the issues it blocks (`by`). */
export interface IssueChain {
  on: InboxRoadmapItem[];
  by: InboxRoadmapItem[];
}

/** Item ids are project-local slugs, so a chain key carries the project. */
export function chainKey(item: Pick<InboxRoadmapItem, "id" | "project">): string {
  return `${item.project.id}/${item.id}`;
}

/**
 * Blocking queues from the synced `dependsOn` (Jira "is blocked by", GitHub
 * "blocked by #n" / sub-issues, plus ZIBBY-owned edges). One level each way,
 * within one project; archived and unknown ids are dropped. Items without a
 * link are absent.
 */
export function issueChains(items: InboxRoadmapItem[]): Map<string, IssueChain> {
  const listed = items.filter(isListable);
  const byKey = new Map(listed.map((item) => [chainKey(item), item]));
  const chains = new Map<string, IssueChain>();
  const chainOf = (item: InboxRoadmapItem) => {
    let chain = chains.get(chainKey(item));
    if (!chain) chains.set(chainKey(item), (chain = { on: [], by: [] }));
    return chain;
  };
  for (const blocked of listed) {
    for (const id of blocked.dependsOn) {
      const blocker = byKey.get(`${blocked.project.id}/${id}`);
      if (!blocker || blocker === blocked) continue;
      chainOf(blocked).on.push(blocker);
      chainOf(blocker).by.push(blocked);
    }
  }
  return chains;
}

/** Joins an item's PR reference with the PR list (by url) for ci / blocker. */
export function findPr(prs: InboxPr[], ref: ItemPrRef | null): InboxPr | undefined {
  return ref ? prs.find((pr) => pr.url === ref.url) : undefined;
}

/** The run `View run` opens: the latest one (a task id exists as soon as the gate released it). */
export function latestTaskId(item: InboxRoadmapItem): string | undefined {
  return [...item.runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]
    ?.taskId;
}

// ---------------------------------------------------------------------------
// Counters (global: ignore filters, count only actionable)
// ---------------------------------------------------------------------------

export interface InboxCounts {
  issues: number;
  toReview: number;
  mineBlocked: number;
}

export function inboxCounts(items: InboxRoadmapItem[], prs: InboxPr[]): InboxCounts {
  return {
    issues: items.filter(isActionable).length,
    toReview: prs.filter((pr) => pr.bucket === "to-review").length,
    mineBlocked: prs.filter(isMineBlocked).length,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Sub-nav label suffix — `" · 05"` for issues, `" · 03 · 02"` for PRs; `""` until loaded. */
export function counterSuffix(tab: string, counts: InboxCounts | undefined): string {
  if (!counts) return "";
  if (tab === "issues") return ` · ${pad(counts.issues)}`;
  if (tab === "pull-requests") return ` · ${pad(counts.toReview)} · ${pad(counts.mineBlocked)}`;
  return "";
}

/** Zero-padded two-digit number, the mono counters' look. */
export const pad2 = pad;

// ---------------------------------------------------------------------------
// Time + text helpers
// ---------------------------------------------------------------------------

export type ElapsedUnit = "now" | "min" | "h" | "d";

/** Coarse elapsed time since `iso`: now (<1 min) / minutes / hours / days. */
export function elapsed(iso: string, now: number): { unit: ElapsedUnit; n: number } {
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (min < 1) return { unit: "now", n: 0 };
  if (min < 60) return { unit: "min", n: min };
  if (min < 24 * 60) return { unit: "h", n: Math.floor(min / 60) };
  return { unit: "d", n: Math.floor(min / (24 * 60)) };
}
