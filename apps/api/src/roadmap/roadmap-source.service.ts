import { Injectable, Optional } from "@nestjs/common";
import type {
  CredentialsInput,
  GitHubConfig,
  Integration,
  JiraConfig,
  LevelMappingTarget,
  Project,
  RoadmapItem,
  RoadmapItemLevel,
  RoadmapLinkedPr,
  RoadmapScopeReason,
  RoadmapSource,
  RoadmapSourceStatus,
  RoadmapSyncResult,
} from "@zibby/contracts";
import type { InboxSourceError, RoutingItem } from "@zibby/contracts";
import {
  composeLevelMapping,
  matchRouting,
  resolveLevel,
  roadmapItemIdForSource,
} from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { AttachmentStorageService } from "../tasks/attachment-storage.service";
import { adfToMarkdown } from "./adf-to-markdown";
import { LevelMappingStore } from "./level-mapping.store";
import { mergeDependsOn } from "./merge-depends-on";
import { RoadmapItemNotFoundError } from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";

const GITHUB_API = "https://api.github.com";

/** Per-item caps (125b master plan): 25 MB per file, 10 files per item. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ITEM = 10;

/** Bounds the pagination loops below — a full backfill must still terminate. */
const MAX_PAGES = 20;
const PAGE_SIZE = 100;

/** Structural match for `AttachmentStorageService.save`'s (unexported) `UploadedFile`. */
interface DownloadedAttachment {
  originalname: string;
  size: number;
  mimetype?: string;
  buffer: Buffer;
}

/** One attachment as seen from the source, not yet downloaded. */
interface NormalizedAttachment {
  name: string;
  size: number;
  mediaType?: string;
  download: () => Promise<Buffer>;
}

/** A source issue/milestone, normalized to the shape the shared upsert needs. */
interface NormalizedSourceIssue {
  projectId: string;
  integrationId: string;
  sourceKind: "jira" | "github";
  /** This source's own id for the item — the upsert key alongside `integrationId`. */
  externalId: string;
  /** Human-facing id shown on the card ("PROJ-14", "#42", "Milestone #3"). */
  externalKey: string;
  url?: string;
  name: string;
  description: string;
  externalLevel: string;
  level: RoadmapItemLevel;
  /** The epic parent's externalId, in THIS source's externalId domain, if resolved. */
  parentExternalId?: string;
  /** Ids (in this source's externalId domain) this item depends on. */
  dependsOnExternalIds: string[];
  /** `"todo" | "external" | "done"` — see `jiraWorkState`. GitHub issues pass `"done"`/`"todo"`. */
  workState: JiraWorkState;
  /** An open PR naming this item's key — Jira only, sync-owned (see `findLinkedPr`). */
  linkedPr?: RoadmapLinkedPr;
  /** Sync-owned (see `RoadmapItemSchema.sourceStatus`). */
  sourceStatus?: RoadmapSourceStatus;
  /** Sync-owned; `undefined` = identity unknown this sync, so the stored value is kept. */
  scopeReasons?: RoadmapScopeReason[];
  attachments: NormalizedAttachment[];
}

interface UpsertOutcome {
  outcome: "imported" | "updated";
  itemId: string;
  notes: string[];
}

// --- Jira wire shapes (API v3 `/rest/api/3/search`) -------------------------

interface JiraStatus {
  name?: string;
  statusCategory?: { key?: string };
}
interface JiraIssueLink {
  type?: { name?: string; inward?: string; outward?: string };
  inwardIssue?: { key?: string };
  outwardIssue?: { key?: string };
}
interface JiraAttachment {
  filename?: string;
  size?: number;
  mimeType?: string;
  /** The authenticated download URL. */
  content?: string;
}
interface JiraSearchIssue {
  key?: string;
  fields?: {
    summary?: string;
    /** ADF JSON (API v3), not plain text — see `adfToMarkdown`. */
    description?: unknown;
    issuetype?: { name?: string };
    parent?: { key?: string };
    status?: JiraStatus;
    issuelinks?: JiraIssueLink[];
    attachment?: JiraAttachment[];
    assignee?: { accountId?: string } | null;
    reporter?: { accountId?: string } | null;
    watches?: { isWatching?: boolean };
    components?: { name?: string }[];
    labels?: string[];
  };
}
interface JiraSearchResponse {
  issues?: JiraSearchIssue[];
  /** Cursor pagination (`/search/jql`): the token for the NEXT page, absent on the last. */
  nextPageToken?: string;
  /** True on the final page. The `/search/jql` endpoint returns NO `total`. */
  isLast?: boolean;
  errorMessages?: string[];
}

// --- GitHub wire shapes ------------------------------------------------------

interface GitHubIssue {
  number?: number;
  title?: string;
  body?: string | null;
  state?: string;
  html_url?: string;
  /** Present (any shape) only on a PR — the issues endpoint returns both. */
  pull_request?: unknown;
  milestone?: { number?: number } | null;
  user?: { login?: string } | null;
  assignees?: { login?: string }[];
}
interface GitHubMilestone {
  number?: number;
  title?: string;
  description?: string | null;
  state?: string;
  html_url?: string;
}
interface GitHubPull {
  number?: number;
  html_url?: string;
  title?: string;
  head?: { ref?: string };
}

/** PAT/API-token from the closed credentials union (null if absent) — same helper every adapter has. */
function tokenOf(creds: CredentialsInput | null): string | null {
  return creds && "token" in creds ? creds.token : null;
}

type JiraIntegration = Integration & { config: JiraConfig };
type GitHubIntegration = Integration & { config: GitHubConfig };

/** Where one item goes (Phase 128 D7): the write-target project ids, or why it can't be routed. */
type Routed = string[] | { reason: string };

const emptySummary = (): RoadmapSyncResult => ({
  imported: 0,
  updated: 0,
  archived: 0,
  skipped: 0,
  notes: [],
});

function summaryFor(results: Map<string, RoadmapSyncResult>, projectId: string): RoadmapSyncResult {
  let summary = results.get(projectId);
  if (!summary) results.set(projectId, (summary = emptySummary()));
  return summary;
}

function recordUpsert(summary: RoadmapSyncResult, outcome: UpsertOutcome): void {
  summary[outcome.outcome] += 1;
  for (const note of outcome.notes) summary.notes.push({ itemId: outcome.itemId, note });
}

function setFor(sets: Map<string, Set<string>>, key: string): Set<string> {
  let set = sets.get(key);
  if (!set) sets.set(key, (set = new Set()));
  return set;
}

/** The first Jira and the first GitHub integration (today's "one of each" rule), narrowed by `source`. */
function syncableIntegrations(
  integrations: Integration[],
  source?: "jira" | "github",
): (JiraIntegration | GitHubIntegration)[] {
  const jira =
    source === "github"
      ? undefined
      : integrations.find((i): i is JiraIntegration => i.config.kind === "jira");
  const github =
    source === "jira"
      ? undefined
      : integrations.find((i): i is GitHubIntegration => i.config.kind === "github");
  return [...(jira ? [jira] : []), ...(github ? [github] : [])];
}

/**
 * The integration's own Jira scope without `ORDER BY` — a routing rule's `jql` is
 * AND'ed with it, so routing can only narrow what the integration already fetches (D5).
 */
function jiraScopeClause(config: JiraConfig): string {
  if (config.jql) return config.jql.replace(/\s+ORDER\s+BY\s[\s\S]*$/i, "");
  return config.projectKey ? `project = ${config.projectKey}` : "assignee = currentUser()";
}

function jiraRoutingItem(integrationId: string, key: string, issue: JiraSearchIssue): RoutingItem {
  return {
    integrationId,
    kind: "jira",
    jira: {
      projectKey: key.replace(/-\d+$/, ""),
      components: (issue.fields?.components ?? [])
        .map((c) => c.name)
        .filter((name): name is string => typeof name === "string"),
      labels: issue.fields?.labels ?? [],
    },
  };
}

function isRoadmapLevel(target: LevelMappingTarget): target is RoadmapItemLevel {
  return target === "epic" || target === "task";
}

function attachmentsSignature(attachments: readonly { name: string; size: number }[]): string {
  return [...attachments]
    .map((attachment) => `${attachment.name}:${attachment.size}`)
    .sort()
    .join("|");
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Resolve the nearest ANCESTOR whose resolved level is `"epic"`, walking up
 * Jira's `fields.parent` chain — this single walk handles BOTH the classic
 * "Sub-task flattens to task, inherits the parent's epic" case (the immediate
 * parent is a Story, which itself has an epic parent) and a team-managed
 * Story/Task that names its epic directly via `parent` (one hop). Returns
 * `undefined` when there's no parent, or the chain runs outside this sync
 * batch (the referenced key wasn't returned by the same search) — an
 * unparented task is a safe degradation, never a thrown error. Depth-capped
 * against a malformed/cyclic parent chain.
 */
function resolveEpicParent(
  issue: JiraSearchIssue,
  byKey: ReadonlyMap<string, JiraSearchIssue>,
  levelOf: ReadonlyMap<string, LevelMappingTarget>,
  depth = 0,
): string | undefined {
  if (depth > 25) return undefined;
  const parentKey = issue.fields?.parent?.key;
  if (!parentKey) return undefined;
  const parent = byKey.get(parentKey);
  if (!parent) return undefined; // the parent isn't part of this sync's batch
  if (levelOf.get(parentKey) === "epic") return parentKey;
  return resolveEpicParent(parent, byKey, levelOf, depth + 1);
}

/**
 * Jira issuelinks -> the keys THIS issue depends on ("is blocked by"). Jira
 * surfaces a link's direction via which of `inwardIssue`/`outwardIssue` is
 * present, each paired with its own directional phrase (`type.inward` /
 * `type.outward`) describing THIS issue's relationship to that referenced
 * issue. Only the direction whose phrase reads "blocked by" (case-insensitive)
 * contributes a dependency — the classic `Blocks` link type gives
 * `{inward: "is blocked by", outward: "blocks"}`, so an issue that BLOCKS
 * another (an `outwardIssue` entry, phrase "blocks") must NOT be recorded as
 * depending on that other issue: that is the other issue's edge, which shows
 * up on ITS OWN `issuelinks` (Jira returns the link on both sides) as an
 * `inwardIssue` entry with phrase "is blocked by". Getting this backwards
 * would silently gate the wrong item — the exact failure this phase exists to
 * prevent.
 */
function jiraDependsOnKeys(links: readonly JiraIssueLink[]): string[] {
  const out = new Set<string>();
  for (const link of links) {
    const inwardKey = link.inwardIssue?.key;
    if (
      inwardKey &&
      typeof link.type?.inward === "string" &&
      /blocked by/i.test(link.type.inward)
    ) {
      out.add(inwardKey);
    }
    const outwardKey = link.outwardIssue?.key;
    if (
      outwardKey &&
      typeof link.type?.outward === "string" &&
      /blocked by/i.test(link.type.outward)
    ) {
      out.add(outwardKey);
    }
  }
  return [...out];
}

function isJiraDone(status: JiraStatus | undefined): boolean {
  if (!status) return false;
  if (status.statusCategory?.key === "done") return true;
  return typeof status.name === "string" && /^(done|closed|resolved)$/i.test(status.name);
}

type JiraWorkState = "todo" | "external" | "done";

/**
 * Whether ZIBBY may start this issue. Only the "new" status category (To Do,
 * Backlog, Open, …) is safe to start; "done" is finished; anything else —
 * "indeterminate" (In Progress, Code Review, …), a missing or unknown
 * category — means someone may already be on it, so it is `external`
 * (fail-closed: an unrecognised status never becomes startable work).
 */
function jiraWorkState(status: JiraStatus | undefined): JiraWorkState {
  if (isJiraDone(status)) return "done";
  return status?.statusCategory?.key === "new" ? "todo" : "external";
}

function jiraSourceStatus(status: JiraStatus | undefined): RoadmapSourceStatus | undefined {
  return status?.name
    ? { name: status.name, done: status.statusCategory?.key === "done" }
    : undefined;
}

/**
 * Why a Jira issue is the operator's. `mentioned` isn't derivable from the search
 * response (it would need a comment scan per issue), so it's never set for Jira.
 */
function jiraScopeReasons(
  fields: JiraSearchIssue["fields"],
  me: string | undefined,
): RoadmapScopeReason[] | undefined {
  if (!me) return undefined;
  const reasons: RoadmapScopeReason[] = [];
  if (fields?.assignee?.accountId === me) reasons.push("assigned");
  if (fields?.reporter?.accountId === me) reasons.push("reported");
  if (fields?.watches?.isWatching) reasons.push("watched");
  return reasons;
}

/**
 * Whole-token, case-insensitive match of a source key in a PR title or branch
 * (`PROJ-1` matches "PROJ-1: fix" and "proj-1-login", never "PROJ-12").
 */
function findLinkedPr(key: string, pulls: readonly GitHubPull[]): RoadmapLinkedPr | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?![0-9])`, "i");
  const pr = pulls.find((p) => re.test(p.title ?? "") || re.test(p.head?.ref ?? ""));
  if (!pr?.number || !pr.html_url) return undefined;
  return { number: pr.number, url: pr.html_url, title: pr.title ?? "" };
}

/**
 * Parse `Depends on #N` / `Blocked by #N` from a GitHub issue body — case-
 * insensitive, tolerant of a list (`Blocked by #12, #14 and #16`). Matches the
 * phrase through to end-of-line so it only picks up numbers actually named by
 * that phrase, not every `#N` anywhere in the body (a body routinely mentions
 * unrelated issues by number in plain prose).
 */
function parseGithubDependsOn(body: string): number[] {
  const out = new Set<number>();
  const phrase = /\b(?:depends?\s+on|blocked\s+by)\b[^\n]*/gi;
  for (const match of body.matchAll(phrase)) {
    for (const numberMatch of match[0].matchAll(/#(\d+)/g)) {
      const raw = numberMatch[1];
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) out.add(parsed);
    }
  }
  return [...out];
}

/**
 * 125b — imports roadmap items from a project's resolved Jira/GitHub
 * integrations and upserts them via `RoadmapStore`. Reuses the same auth seam
 * the channel adapters and `ProjectPrService` use (`CredentialsStore` +
 * `ResolvedProjectService.resolveIntegrations` — NEVER `integrations.list()
 * .filter(...)`, or a company-level integration is invisible), but does NOT
 * reuse `ChannelAdapter.poll`: the channel adapters fetch a message-shaped
 * subset (`JiraChannelAdapter`'s `JiraIssue` doesn't even read `description`),
 * while this import needs full fields, links and attachments.
 *
 * Sync is read-only toward Jira/GitHub in both directions (Law 3: nothing in
 * this phase writes back, merges, or dispatches) and treats every field of an
 * issue body as untrusted data (Law 4) — `adfToMarkdown`/markdown pass-through
 * never interpret content as instructions, only as display text.
 *
 * `fetchImpl` is injectable (`@Optional()`, default `fetch`) — the same seam
 * as `JiraChannelAdapter`/`ProjectPrService` — so this is fully testable
 * without network.
 */
@Injectable()
export class RoadmapSourceService {
  private readonly fetchImpl: typeof fetch;
  /**
   * Last failure per `projectId:source`, cleared by that source's next clean sync —
   * surfaced by the Inbox as a non-blocking banner.
   * ponytail: in-memory, lost on restart; persist next to `_config.json` if it matters.
   */
  private readonly failures = new Map<string, InboxSourceError>();

  constructor(
    private readonly roadmap: RoadmapStore,
    private readonly levelMapping: LevelMappingStore,
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly attachments: AttachmentStorageService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /**
   * Pull the project's resolved Jira/GitHub integrations and upsert their
   * issues. A project with no Jira/GitHub integration configured returns an
   * all-zero summary — NOT an error (mirrors `ProjectPrService.listOpen`'s
   * "no link is not an error" posture). A project id that doesn't resolve to
   * a real project propagates `ProjectNotFoundError` (mapped to 404 by the
   * controller). Jira and GitHub sync independently: a hard failure in one
   * (network, rate limit, a malformed response) is recorded as a note rather
   * than aborting the other source's sync.
   *
   * `source` (source-picker split button) narrows which source runs:
   * `undefined` syncs both (today's behaviour), `"jira"`/`"github"` syncs
   * only that one. A project missing the REQUESTED source's integration still
   * returns an all-zero summary, same posture as the "no integration at all"
   * case — never an error.
   */
  async sync(projectId: string, source?: "jira" | "github"): Promise<RoadmapSyncResult> {
    const project: Project = await this.projects.get(projectId); // 404 before anything else
    const integrations = await this.resolvedProjects.resolveIntegrations(project);
    const results = new Map<string, RoadmapSyncResult>();
    // Project-scoped: a company integration is fetched whole, but only THIS project's share is written.
    const writeTo = new Set([projectId]);
    for (const integration of syncableIntegrations(integrations, source)) {
      await this.syncIntegration(integration, writeTo, results);
    }
    return summaryFor(results, projectId);
  }

  /**
   * Phase 128 (D7) — the auto-sync tick's entry point: each integration that feeds
   * any of `projectIds` is synced ONCE (fetch once, distribute), writing only to
   * the projects in `projectIds` it feeds. Per-project summaries; an unknown
   * project id is skipped.
   */
  async syncProjects(projectIds: Iterable<string>): Promise<Map<string, RoadmapSyncResult>> {
    const groups = new Map<string, { integration: Integration; writeTo: Set<string> }>();
    for (const projectId of projectIds) {
      const project = await this.projects.get(projectId).catch(() => null);
      if (!project) continue;
      for (const integration of syncableIntegrations(
        await this.resolvedProjects.resolveIntegrations(project),
      )) {
        const group = groups.get(integration.id) ?? { integration, writeTo: new Set<string>() };
        group.writeTo.add(projectId);
        groups.set(integration.id, group);
      }
    }
    const results = new Map<string, RoadmapSyncResult>();
    for (const { integration, writeTo } of groups.values()) {
      await this.syncIntegration(integration, writeTo, results);
    }
    return results;
  }

  /** Every source's last sync failure that hasn't been cleared by a clean sync since. */
  lastFailures(): InboxSourceError[] {
    return [...this.failures.values()];
  }

  private async syncIntegration(
    integration: Integration,
    writeTo: ReadonlySet<string>,
    results: Map<string, RoadmapSyncResult>,
  ): Promise<void> {
    const config = integration.config;
    if (config.kind !== "jira" && config.kind !== "github") return;
    const source = config.kind;
    try {
      if (config.kind === "jira") {
        await this.syncJira({ ...integration, config }, writeTo, results);
      } else {
        await this.syncGithub({ ...integration, config }, writeTo, results);
      }
      for (const projectId of writeTo) this.failures.delete(`${projectId}:${source}`);
    } catch (error) {
      const message = (error as Error).message;
      for (const projectId of writeTo) {
        summaryFor(results, projectId).notes.push({
          itemId: integration.id,
          note: `${source} sync failed: ${message}`,
        });
        this.failures.set(`${projectId}:${source}`, {
          projectId,
          source,
          message: message || "unknown error",
        });
      }
    }
  }

  /**
   * Phase 128 (D1/D7) — how items of `integration` are distributed. A project-owned
   * integration, or a company one no inheriting project has a routing rule for yet,
   * sends every item to every write target (pre-routing behaviour); a company GitHub
   * integration is never in that case (D3: implicit routing by gitRemote). Otherwise
   * `matchRouting` over the inheriting projects decides: exactly one match, or the
   * item is unroutable (D4 — never first-match); a match outside `writeTo` is
   * simply not written by this call. `jqlRules` lists the rules whose JQL the
   * caller must run server-side to fill `jqlMatches`.
   */
  private async routerFor(
    integration: Integration,
    writeTo: ReadonlySet<string>,
  ): Promise<{
    route: (item: RoutingItem, jqlMatches?: ReadonlySet<string>) => Routed;
    jqlRules: { projectId: string; jql: string }[];
  }> {
    const inheriting = await this.resolvedProjects.inheritingProjects(integration);
    const rulesOf = (project: Project) =>
      (project.integrationRouting ?? []).filter((rule) => rule.integrationId === integration.id);
    // GitHub of a company is always routed (implicitly by gitRemote), never "all".
    const implicit = integration.kind === "github" && Boolean(integration.companyId);
    if (!implicit && !inheriting.some((project) => rulesOf(project).length > 0)) {
      return { route: () => [...writeTo], jqlRules: [] };
    }
    const jqlRules: { projectId: string; jql: string }[] = [];
    for (const project of inheriting) {
      for (const { match } of rulesOf(project)) {
        if (match.kind === "jira" && match.jql)
          jqlRules.push({ projectId: project.id, jql: match.jql });
      }
    }
    const route = (item: RoutingItem, jqlMatches?: ReadonlySet<string>): Routed => {
      const matched = matchRouting(item, inheriting, jqlMatches);
      if (matched.length === 0)
        return {
          reason:
            integration.kind === "github"
              ? "matches no project's git remote"
              : "matches no project's routing rule",
        };
      if (matched.length > 1) {
        return { reason: `matches ${matched.length} projects (${matched.join(", ")})` };
      }
      return matched.filter((id) => writeTo.has(id));
    };
    return { route, jqlRules };
  }

  /** Global level mapping with the integration's company overrides on top (D9). */
  private async levelMappingFor(integration: Integration) {
    const company = await this.resolvedProjects.integrationCompany(integration);
    return composeLevelMapping(await this.levelMapping.read(), company?.levelMapping);
  }

  /**
   * Open PRs per write-target project, from that project's own resolved GitHub
   * integration (fetched once per GitHub integration). A failed lookup is a note,
   * never a failed sync.
   */
  private async pullsByProject(
    writeTo: ReadonlySet<string>,
    results: Map<string, RoadmapSyncResult>,
  ): Promise<Map<string, GitHubPull[]>> {
    const byIntegration = new Map<string, GitHubPull[]>();
    const out = new Map<string, GitHubPull[]>();
    for (const projectId of writeTo) {
      const project = await this.projects.get(projectId).catch(() => null);
      if (!project) continue;
      const [github] = syncableIntegrations(
        await this.resolvedProjects.resolveIntegrations(project),
        "github",
      );
      if (!github || github.config.kind !== "github") continue;
      let pulls = byIntegration.get(github.id);
      if (!pulls) {
        pulls = [];
        const ghToken = tokenOf(await this.credentials.read(github.id));
        if (ghToken) {
          try {
            pulls = await this.fetchOpenGithubPulls(github.config.repo, {
              authorization: `Bearer ${ghToken}`,
              accept: "application/vnd.github+json",
            });
          } catch (error) {
            summaryFor(results, projectId).notes.push({
              itemId: github.id,
              note: `github PR lookup failed: ${(error as Error).message}`,
            });
          }
        }
        byIntegration.set(github.id, pulls);
      }
      out.set(projectId, pulls);
    }
    return out;
  }

  // --- Jira ------------------------------------------------------------------

  private async syncJira(
    integration: JiraIntegration,
    writeTo: ReadonlySet<string>,
    results: Map<string, RoadmapSyncResult>,
  ): Promise<void> {
    const token = tokenOf(await this.credentials.read(integration.id));
    if (!token) return; // no credentials configured for this integration — nothing to sync

    // PR lookup for linking is resolved independently of the `source` filter
    // — a `source: "jira"` sync must still be able to link an existing PR.
    const pullsOf = await this.pullsByProject(writeTo, results);

    const authHeader = `Basic ${Buffer.from(`${integration.config.email}:${token}`).toString("base64")}`;
    const me = await this.fetchJiraAccountId(integration.config.baseUrl, authHeader);
    const primaryIssues = await this.fetchAllJiraIssues(
      integration.config.baseUrl,
      integration.config.jql,
      integration.config.projectKey,
      authHeader,
    );
    // Custom jql means the operator already declared the exact set they want
    // — augmenting it with ancestor epics would second-guess that. The
    // default clause (whole-project or "mine") still gets epic-preservation:
    // for the whole-project scope this is mostly a no-op (an ancestor in the
    // same project is already in the primary set), but a cross-project
    // parent still needs the supplementary fetch.
    const hasCustomJql = Boolean(integration.config.jql);
    const ownedKeys = new Set(
      primaryIssues
        .map((issue) => issue.key)
        .filter((key): key is string => typeof key === "string"),
    );
    const rawIssues = hasCustomJql
      ? primaryIssues
      : await this.expandWithAncestorEpics(integration.config.baseUrl, authHeader, primaryIssues);

    const byKey = new Map<string, JiraSearchIssue>();
    for (const issue of rawIssues) {
      if (issue.key) byKey.set(issue.key, issue);
    }

    const externalLevels = [
      ...new Set(
        rawIssues
          .map((issue) => issue.fields?.issuetype?.name)
          .filter((name): name is string => typeof name === "string" && name.length > 0),
      ),
    ];
    await this.levelMapping.ensureLevels("jira", externalLevels);
    const mapping = await this.levelMappingFor(integration);

    const levelOf = new Map<string, LevelMappingTarget>();
    for (const issue of rawIssues) {
      if (!issue.key) continue;
      const externalLevel = issue.fields?.issuetype?.name ?? "";
      levelOf.set(issue.key, resolveLevel(mapping, "jira", externalLevel) ?? "task");
    }

    // Routing (D7): each rule's JQL runs server-side, AND'ed with the integration's
    // own scope, to learn which issues it claims for its project.
    const { route, jqlRules } = await this.routerFor(integration, writeTo);
    const jqlMatches = new Map<string, Set<string>>();
    for (const rule of jqlRules) {
      const ruleJql = rule.jql.replace(/\s+ORDER\s+BY\s[\s\S]*$/i, "");
      const hits = await this.fetchAllJiraIssues(
        integration.config.baseUrl,
        `(${ruleJql}) AND (${jiraScopeClause(integration.config)}) ORDER BY created ASC`,
        undefined,
        authHeader,
      );
      for (const hit of hits) if (hit.key) setFor(jqlMatches, hit.key).add(rule.projectId);
    }
    const routedOf = new Map<string, Routed>();
    for (const issue of rawIssues) {
      if (!issue.key) continue;
      routedOf.set(
        issue.key,
        route(jiraRoutingItem(integration.id, issue.key, issue), jqlMatches.get(issue.key)),
      );
    }

    const seen = new Map<string, Set<string>>();
    for (const issue of rawIssues) {
      if (!issue.key) continue;
      const target = levelOf.get(issue.key) ?? "task";
      const isOwned = ownedKeys.has(issue.key);
      const routed = routedOf.get(issue.key) ?? [];
      if (isOwned) {
        if (!isRoadmapLevel(target)) {
          for (const projectId of Array.isArray(routed) ? routed : writeTo) {
            summaryFor(results, projectId).skipped += 1;
          }
          continue;
        }
        if (!Array.isArray(routed)) {
          for (const projectId of writeTo) {
            const summary = summaryFor(results, projectId);
            summary.skipped += 1;
            summary.notes.push({
              itemId: roadmapItemIdForSource(integration.id, issue.key),
              note: `${issue.key} ${routed.reason} — not imported`,
            });
          }
          continue;
        }
      } else {
        // A supplementary ancestor pulled in only to preserve epic-grouping
        // (see `expandWithAncestorEpics`) — imported ONLY when it resolves to
        // an epic. An ancestor that resolves to `"task"` (e.g. an
        // intermediate story in a multi-hop chain) is silently dropped here:
        // it's outside the configured scope (a cross-project parent, or —
        // without a `projectKey` — outside "mine"), pulled in only to walk
        // the chain, never meant to land on the board itself. It also
        // must NOT count toward `summary.skipped` (that counter is reserved
        // for level-mapping `"ignore"`, a different reason) or join `seen`
        // (so `archiveMissing` never has to reason about it).
        // An unroutable ancestor is dropped the same silent way (see above).
        if (target !== "epic" || !Array.isArray(routed)) continue;
      }

      const externalLevel = issue.fields?.issuetype?.name ?? "";
      const epicKey = target === "epic" ? undefined : resolveEpicParent(issue, byKey, levelOf);
      const epicRouted = epicKey ? routedOf.get(epicKey) : undefined;
      const attachments: NormalizedAttachment[] = (issue.fields?.attachment ?? []).map((raw) => ({
        name: raw.filename ?? "attachment",
        size: raw.size ?? 0,
        ...(raw.mimeType ? { mediaType: raw.mimeType } : {}),
        download: () => this.downloadBytes(raw.content, { authorization: authHeader }),
      }));

      for (const projectId of routed) {
        setFor(seen, projectId).add(issue.key);
        // The epic parent only when it lands in the same project.
        const parentExternalId =
          Array.isArray(epicRouted) && epicRouted.includes(projectId) ? epicKey : undefined;
        const linkedPr = findLinkedPr(issue.key, pullsOf.get(projectId) ?? []);
        const remote = jiraWorkState(issue.fields?.status);
        const workState: JiraWorkState = remote === "todo" && linkedPr ? "external" : remote;

        const outcome = await this.upsertItem({
          projectId,
          integrationId: integration.id,
          sourceKind: "jira",
          externalId: issue.key,
          externalKey: issue.key,
          url: `${integration.config.baseUrl}/browse/${issue.key}`,
          name: issue.fields?.summary ?? issue.key,
          description: adfToMarkdown(issue.fields?.description ?? null),
          externalLevel,
          level: target,
          parentExternalId,
          dependsOnExternalIds: jiraDependsOnKeys(issue.fields?.issuelinks ?? []),
          workState,
          ...(linkedPr ? { linkedPr } : {}),
          sourceStatus: jiraSourceStatus(issue.fields?.status),
          scopeReasons: jiraScopeReasons(issue.fields, me),
          attachments,
        });
        recordUpsert(summaryFor(results, projectId), outcome);
      }
    }

    for (const projectId of writeTo) {
      await this.archiveMissing(
        projectId,
        integration.id,
        setFor(seen, projectId),
        summaryFor(results, projectId),
      );
    }
  }

  /**
   * Full backfill, deliberately unlike the Jira/GitHub CHANNEL adapters
   * (`JiraChannelAdapter`/`GitHubChannelAdapter`), which seed their cursor to
   * "now" and never backfill on first poll. The roadmap import has no
   * cursor at all — it needs the project's WHOLE backlog, not just what
   * changed since some prior point, so every sync re-requests everything the
   * configured `jql`/`projectKey` matches (paginated via `startAt`, capped at
   * `MAX_PAGES` so a runaway result set still terminates).
   *
   * A custom `jql` is used VERBATIM — the operator already declared the
   * exact set they want. Otherwise the default scope is the WHOLE project
   * backlog when `projectKey` is set (`project = <projectKey>`) — the sync
   * must see work others already started, so it can keep ZIBBY off it — and
   * falls back to "mine" (`assignee = currentUser()`) only when no
   * `projectKey` is configured, so it never pulls a whole Jira site. This is
   * also reused (with an explicit `jql` and no `projectKey`) for the
   * `key in (...)` supplementary ancestor-epic fetch in
   * `expandWithAncestorEpics`.
   *
   * Endpoint: `/rest/api/3/search/jql`. The legacy `/rest/api/3/search` was
   * REMOVED by Atlassian (May 2025, CHANGE-2046) and now answers 410 Gone, so
   * every sync against it silently failed — this is the replacement. It
   * paginates by an opaque `nextPageToken` cursor (NOT `startAt`/`maxResults`
   * offsets) and returns NO `total`: a page is the last one when it says
   * `isLast` or omits `nextPageToken`.
   */
  private async fetchAllJiraIssues(
    baseUrl: string,
    jql: string | undefined,
    projectKey: string | undefined,
    authHeader: string,
  ): Promise<JiraSearchIssue[]> {
    const clause =
      jql ??
      (projectKey
        ? `project = ${projectKey} ORDER BY created ASC`
        : `assignee = currentUser() ORDER BY created ASC`);
    const out: JiraSearchIssue[] = [];
    let nextPageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        jql: clause,
        maxResults: String(PAGE_SIZE),
        fields:
          "summary,description,issuetype,parent,issuelinks,attachment,status,assignee,reporter,watches,components,labels",
      });
      if (nextPageToken) params.set("nextPageToken", nextPageToken);
      const res = await this.fetchImpl(`${baseUrl}/rest/api/3/search/jql?${params}`, {
        headers: { authorization: authHeader, accept: "application/json" },
      });
      if (res.status === 429) {
        throw new Error(`jira rate limited (retry_after ${res.headers.get("retry-after") ?? "?"})`);
      }
      const body = (await res.json()) as JiraSearchResponse;
      if (!res.ok) {
        throw new Error(`jira search: ${body.errorMessages?.join("; ") ?? `HTTP ${res.status}`}`);
      }
      const issues = body.issues ?? [];
      out.push(...issues);
      if (issues.length === 0 || body.isLast || !body.nextPageToken) break;
      nextPageToken = body.nextPageToken;
    }
    return out;
  }

  /** The operator's Jira accountId for `scopeReasons`; any failure → unknown, never a failed sync. */
  private async fetchJiraAccountId(
    baseUrl: string,
    authHeader: string,
  ): Promise<string | undefined> {
    try {
      const res = await this.fetchImpl(`${baseUrl}/rest/api/3/myself`, {
        headers: { authorization: authHeader, accept: "application/json" },
      });
      if (!res.ok) return undefined;
      return ((await res.json()) as { accountId?: string }).accountId || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Epic-preservation for the default "mine" scope: `assignee = currentUser()`
   * returns my tasks/stories but not their parent epics (epics are rarely
   * assigned to me), so `resolveEpicParent` would find no parent within the
   * primary batch alone and every owned issue would render unparented. This
   * walks the owned issues' `fields.parent.key` chain, collecting ancestor
   * keys not already in the batch, and does bounded supplementary
   * `key in (<keys>)` fetches (reusing `fetchAllJiraIssues`) until no new
   * ancestor key appears — each pass can surface a NEW ancestor's own parent
   * (the classic multi-hop task -> story -> epic chain), so the loop repeats
   * rather than doing a single pass. Capped at 5 iterations so a malformed or
   * unexpectedly deep chain still terminates. Skips a pass entirely when
   * there's nothing missing (an empty key set is never sent to Jira).
   *
   * Returns the union batch; it is the CALLER's job (`syncJira`) to decide
   * which of these newly-added ancestors actually get imported (only those
   * that resolve to `"epic"` — see the ownedKeys/level check there).
   */
  private async expandWithAncestorEpics(
    baseUrl: string,
    authHeader: string,
    issues: JiraSearchIssue[],
  ): Promise<JiraSearchIssue[]> {
    const batch = [...issues];
    const byKey = new Map<string, JiraSearchIssue>();
    for (const issue of batch) {
      if (issue.key) byKey.set(issue.key, issue);
    }

    for (let iteration = 0; iteration < 5; iteration += 1) {
      const missingKeys = new Set<string>();
      for (const issue of batch) {
        const parentKey = issue.fields?.parent?.key;
        if (parentKey && !byKey.has(parentKey)) missingKeys.add(parentKey);
      }
      if (missingKeys.size === 0) break; // nothing to fetch this pass

      const fetched = await this.fetchAllJiraIssues(
        baseUrl,
        `key in (${[...missingKeys].join(",")}) ORDER BY created ASC`,
        undefined,
        authHeader,
      );
      let addedNew = false;
      for (const issue of fetched) {
        if (issue.key && !byKey.has(issue.key)) {
          byKey.set(issue.key, issue);
          batch.push(issue);
          addedNew = true;
        }
      }
      if (!addedNew) break; // the fetch didn't surface anything new — stop
    }
    return batch;
  }

  // --- GitHub ------------------------------------------------------------------

  private async syncGithub(
    integration: GitHubIntegration,
    writeTo: ReadonlySet<string>,
    results: Map<string, RoadmapSyncResult>,
  ): Promise<void> {
    const token = tokenOf(await this.credentials.read(integration.id));
    if (!token) return; // no credentials configured for this integration — nothing to sync

    const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
    const repo = integration.config.repo;
    const username = integration.config.username;

    const rawIssues = await this.fetchAllGithubIssues(repo, username, headers);
    // The Search API returns PRs too, distinguished only by `pull_request`.
    const issues = rawIssues.filter(
      (issue) => issue.pull_request === undefined && issue.number !== undefined,
    );

    // Milestones (epics) are scoped to only those that parent >=1 of MY
    // imported issues — collect the referenced numbers from `issues` (not
    // the full repo) before fetching milestones at all.
    const referencedMilestoneNumbers = new Set<number>();
    for (const issue of issues) {
      if (issue.milestone?.number !== undefined) {
        referencedMilestoneNumbers.add(issue.milestone.number);
      }
    }
    const allMilestones = await this.fetchAllGithubMilestones(repo, headers);
    const milestones = allMilestones.filter(
      (milestone) =>
        milestone.number !== undefined && referencedMilestoneNumbers.has(milestone.number),
    );

    // GitHub routing is per repo, so every item of this integration routes the same way.
    const { route } = await this.routerFor(integration, writeTo);
    const routed = route({ integrationId: integration.id, kind: "github", github: { repo } });
    if (!Array.isArray(routed)) {
      for (const projectId of writeTo) {
        const summary = summaryFor(results, projectId);
        summary.skipped += issues.length;
        summary.notes.push({
          itemId: integration.id,
          note: `${repo} ${routed.reason} — not imported`,
        });
      }
    }
    const targets = Array.isArray(routed) ? routed : [];
    const forTargets = (fn: (summary: RoadmapSyncResult) => void) => {
      for (const projectId of targets) fn(summaryFor(results, projectId));
    };

    await this.levelMapping.ensureLevels("github", ["Milestone", "Issue"]);
    const mapping = await this.levelMappingFor(integration);
    const milestoneTarget = resolveLevel(mapping, "github", "Milestone") ?? "epic";
    const issueTarget = resolveLevel(mapping, "github", "Issue") ?? "task";

    const seen = new Set<string>();

    // Milestones NOT referenced by any of my issues are entirely out of
    // scope — never upserted, never added to `seen`, so `archiveMissing`
    // prunes a previously-imported milestone that no longer parents anything
    // of mine.
    forTargets((summary) => (summary.skipped += allMilestones.length - milestones.length));

    if (isRoadmapLevel(milestoneTarget)) {
      for (const milestone of milestones) {
        if (milestone.number === undefined) continue;
        const externalId = `milestone:${milestone.number}`;
        seen.add(externalId);
        const input: Omit<NormalizedSourceIssue, "projectId"> = {
          integrationId: integration.id,
          sourceKind: "github",
          externalId,
          externalKey: `Milestone #${milestone.number}`,
          ...(milestone.html_url ? { url: milestone.html_url } : {}),
          name: milestone.title ?? `Milestone #${milestone.number}`,
          description: milestone.description ?? "",
          externalLevel: "Milestone",
          level: milestoneTarget,
          dependsOnExternalIds: [],
          workState: milestone.state === "closed" ? "done" : "todo",
          ...(milestone.state
            ? { sourceStatus: { name: milestone.state, done: milestone.state === "closed" } }
            : {}),
          // GitHub issues expose attachments only as inline markdown links in
          // the body, with no listing/download endpoint the way Jira's
          // `fields.attachment` is a structured array — out of scope here.
          attachments: [],
        };
        for (const projectId of targets) {
          recordUpsert(
            summaryFor(results, projectId),
            await this.upsertItem({ ...input, projectId }),
          );
        }
      }
    } else {
      forTargets((summary) => (summary.skipped += milestones.length));
    }

    if (isRoadmapLevel(issueTarget)) {
      for (const issue of issues) {
        if (issue.number === undefined) continue;
        const externalId = `issue:${issue.number}`;
        seen.add(externalId);
        const body = issue.body ?? "";
        const dependsOnNumbers = new Set(parseGithubDependsOn(body));
        // Best-effort native sub-issues (a newer GitHub hierarchy API): a
        // parent issue depends on each of its declared sub-issues finishing,
        // the same "not really done until its children are" relationship
        // Jira's flattened sub-tasks carry implicitly.
        const subIssues = await this.fetchGithubSubIssues(repo, issue.number, headers);
        for (const sub of subIssues) {
          if (sub.number !== undefined) dependsOnNumbers.add(sub.number);
        }
        const parentExternalId =
          issue.milestone?.number !== undefined ? `milestone:${issue.milestone.number}` : undefined;

        const input: Omit<NormalizedSourceIssue, "projectId"> = {
          integrationId: integration.id,
          sourceKind: "github",
          externalId,
          externalKey: `#${issue.number}`,
          ...(issue.html_url ? { url: issue.html_url } : {}),
          name: issue.title ?? `#${issue.number}`,
          description: body,
          externalLevel: "Issue",
          level: issueTarget,
          parentExternalId,
          dependsOnExternalIds: [...dependsOnNumbers].map((n) => `issue:${n}`),
          workState: issue.state === "closed" ? "done" : "todo",
          ...(issue.state
            ? { sourceStatus: { name: issue.state, done: issue.state === "closed" } }
            : {}),
          // `mentioned` would need a second `mentions:` search, which would also
          // widen the roadmap import (and autoPlay) to issues that aren't mine to do.
          scopeReasons: [
            // GitHub logins are case-insensitive; the configured handle may differ in case.
            ...(issue.assignees?.some((a) => a.login?.toLowerCase() === username.toLowerCase())
              ? ["assigned" as const]
              : []),
            ...(issue.user?.login?.toLowerCase() === username.toLowerCase()
              ? ["reported" as const]
              : []),
          ],
          attachments: [],
        };
        for (const projectId of targets) {
          recordUpsert(
            summaryFor(results, projectId),
            await this.upsertItem({ ...input, projectId }),
          );
        }
      }
    } else {
      forTargets((summary) => (summary.skipped += issues.length));
    }

    for (const projectId of writeTo) {
      const seenHere = targets.includes(projectId) ? seen : new Set<string>();
      await this.archiveMissing(
        projectId,
        integration.id,
        seenHere,
        summaryFor(results, projectId),
      );
    }
  }

  /**
   * "Mine" backfill via the Search API (`GET /search/issues?q=repo:<repo>
   * assignee:<username>`), full backfill paginated — see `fetchAllJiraIssues`'s
   * docblock for why the roadmap import always re-requests everything rather
   * than using a cursor. Deliberately spans ALL states — unlike
   * `GitHubChannelAdapter.searchMineOrMentioned`'s `is:open`, the roadmap
   * tracks done/closed items too, so no `is:` qualifier is added. Response
   * shape is `{ items: GitHubIssue[] }`, items in the same shape as the
   * plain issues endpoint (PRs distinguished via `pull_request`, same as
   * today).
   */
  private async fetchAllGithubIssues(
    repo: string,
    username: string,
    headers: Record<string, string>,
  ): Promise<GitHubIssue[]> {
    const out: GitHubIssue[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        q: `repo:${repo} assignee:${username}`,
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const res = await this.fetchImpl(`${GITHUB_API}/search/issues?${params}`, { headers });
      if (res.status === 429 || res.status === 403) {
        throw new Error(`github rate limited (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(`github issues: HTTP ${res.status}`);
      const body = (await res.json()) as { items?: GitHubIssue[] };
      const issues = body.items ?? [];
      out.push(...issues);
      if (issues.length < PAGE_SIZE) break;
    }
    return out;
  }

  private async fetchAllGithubMilestones(
    repo: string,
    headers: Record<string, string>,
  ): Promise<GitHubMilestone[]> {
    const out: GitHubMilestone[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        state: "all",
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const res = await this.fetchImpl(`${GITHUB_API}/repos/${repo}/milestones?${params}`, {
        headers,
      });
      if (res.status === 429 || res.status === 403) {
        throw new Error(`github rate limited (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(`github milestones: HTTP ${res.status}`);
      const body = (await res.json()) as unknown;
      const milestones = Array.isArray(body) ? (body as GitHubMilestone[]) : [];
      out.push(...milestones);
      if (milestones.length < PAGE_SIZE) break;
    }
    return out;
  }

  /**
   * Open PRs for the PR-linking lookup (`GET /repos/{repo}/pulls?state=open`),
   * paged like `fetchAllGithubIssues`. Failure propagates to the caller
   * (`syncJira`), which turns it into a `summary.notes` entry rather than
   * failing the Jira sync.
   */
  private async fetchOpenGithubPulls(
    repo: string,
    headers: Record<string, string>,
  ): Promise<GitHubPull[]> {
    const out: GitHubPull[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        state: "open",
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const res = await this.fetchImpl(`${GITHUB_API}/repos/${repo}/pulls?${params}`, { headers });
      if (!res.ok) throw new Error(`github pulls: HTTP ${res.status}`);
      const body = (await res.json()) as unknown;
      const pulls = Array.isArray(body) ? (body as GitHubPull[]) : [];
      out.push(...pulls);
      if (pulls.length < PAGE_SIZE) break;
    }
    return out;
  }

  /**
   * Best-effort native sub-issues (`GET /issues/{n}/sub_issues`). A 404/410
   * (an older GitHub Enterprise/API version without the endpoint) is NOT an
   * error — nor, for this enrichment-only call, is any other failure: it
   * degrades to "no native sub-issues" rather than failing the whole sync
   * over one issue's optional lookup.
   */
  private async fetchGithubSubIssues(
    repo: string,
    number: number,
    headers: Record<string, string>,
  ): Promise<GitHubIssue[]> {
    try {
      const res = await this.fetchImpl(`${GITHUB_API}/repos/${repo}/issues/${number}/sub_issues`, {
        headers,
      });
      if (!res.ok) return [];
      const body = (await res.json()) as unknown;
      return Array.isArray(body) ? (body as GitHubIssue[]) : [];
    } catch {
      return [];
    }
  }

  // --- Shared upsert ------------------------------------------------------------

  /**
   * The upsert, keyed by `(integrationId, externalId)` via
   * `roadmapItemIdForSource` so re-import is idempotent (the same issue never
   * becomes two items). Enforces the ownership split (`docs/api/roadmap.md`):
   * a re-sync writes only `name`, `description`, `externalLevel`,
   * `attachments`/`attachmentSetId`, `source.url`, `parentId`,
   * `dependsOnFromSource`, `syncNotes`, `syncedAt`, `linkedPr`, `sourceStatus`,
   * `scopeReasons` — plus the
   * narrow, explicitly-sanctioned lifecycle transitions: `-> done` whenever
   * the source reports a done status (from ANY lifecycle — pre-existing,
   * unrelated to this sync), and, for an item still in a sync-owned lifecycle
   * (`todo`/`external`/`archived`), `-> todo | external` per the remote work
   * state (the safe-to-start rule — see `jiraWorkState`/`findLinkedPr`).
   * `running`/`awaiting-merge`/`failed` are NEVER touched here, and a `done`
   * item never moves back out of `done`. `enqueued` is untouched too, EXCEPT
   * `-> external` when the remote work state is `external`: nothing has
   * started on it yet, so a colleague picking it up while it waits in the
   * queue must still stop ZIBBY from dispatching it (`enqueuedAt` is dropped
   * with the move; a remote `todo` state leaves `enqueued` alone). `linkedPr`
   * is written only while the resulting lifecycle is `external`; it is
   * cleared (not merely left stale) once an item returns to `todo`. Never
   * touches `runs`/`overrideBlocked`/`origin`, and rewrites
   * `dependsOn` only via the pure, separately-tested `mergeDependsOn`
   * (dropping a source edge the source removed, adding one it newly
   * declares, preserving every manual edge).
   */
  private async upsertItem(input: NormalizedSourceIssue): Promise<UpsertOutcome> {
    const id = roadmapItemIdForSource(input.integrationId, input.externalId);
    const parentId = input.parentExternalId
      ? roadmapItemIdForSource(input.integrationId, input.parentExternalId)
      : undefined;
    const dependsOnFromSource = input.dependsOnExternalIds.map((externalId) =>
      roadmapItemIdForSource(input.integrationId, externalId),
    );

    let existing: RoadmapItem | null = null;
    try {
      existing = await this.roadmap.get(input.projectId, id);
    } catch (error) {
      if (error instanceof RoadmapItemNotFoundError) existing = null;
      else throw error;
    }

    const { attachmentSetId, attachments, notes } = await this.resolveAttachments(
      input.attachments,
      existing,
    );

    const now = new Date().toISOString();
    const source: RoadmapSource = {
      kind: input.sourceKind,
      integrationId: input.integrationId,
      externalId: input.externalId,
      externalKey: input.externalKey,
      ...(input.url ? { url: input.url } : {}),
    };

    if (!existing) {
      const item: RoadmapItem = {
        id,
        projectId: input.projectId,
        level: input.level,
        parentId,
        name: input.name,
        description: input.description,
        source,
        externalLevel: input.externalLevel,
        attachmentSetId,
        attachments,
        dependsOn: [...dependsOnFromSource],
        dependsOnFromSource,
        lifecycle: input.workState,
        runs: [],
        syncNotes: notes,
        ...(input.linkedPr ? { linkedPr: input.linkedPr } : {}),
        ...(input.sourceStatus ? { sourceStatus: input.sourceStatus } : {}),
        ...(input.scopeReasons ? { scopeReasons: input.scopeReasons } : {}),
        createdAt: now,
        updatedAt: now,
        syncedAt: now,
      };
      await this.roadmap.put(item);
      return { outcome: "imported", itemId: id, notes };
    }

    await this.roadmap.update(input.projectId, id, (current) => {
      const nextDependsOn = mergeDependsOn(
        current.dependsOn,
        current.dependsOnFromSource,
        dependsOnFromSource,
      );
      // Only the sanctioned transitions happen here (see the docblock);
      // anything else — including a lifecycle a later sub-phase (125e)
      // advanced, like `running`/`awaiting-merge`/`failed` — passes through
      // completely untouched. `enqueued` is untouched too, except the one
      // `-> external` exception below (Important #3): nothing has started on
      // it yet, so it must stop being safe-to-start the moment a colleague
      // picks it up remotely, same as `todo`/`external`/`archived`.
      let nextLifecycle = current.lifecycle;
      const enqueuedToExternal = current.lifecycle === "enqueued" && input.workState === "external";
      if (input.workState === "done") {
        nextLifecycle = "done";
      } else if (
        current.lifecycle === "archived" ||
        current.lifecycle === "todo" ||
        current.lifecycle === "external"
      ) {
        nextLifecycle = input.workState;
      } else if (enqueuedToExternal) {
        nextLifecycle = "external";
      }

      const next: RoadmapItem = {
        ...current,
        name: input.name,
        description: input.description,
        externalLevel: input.externalLevel,
        attachmentSetId,
        attachments,
        source: { ...current.source, url: input.url },
        parentId,
        dependsOn: nextDependsOn,
        dependsOnFromSource,
        lifecycle: nextLifecycle,
        syncNotes: notes,
        updatedAt: now,
        syncedAt: now,
        // Left untouched by spreading `current` first: runs, overrideBlocked,
        // origin, createdAt.
      };
      // An `enqueued -> external` move (Important #3) also drops `enqueuedAt`:
      // the item is leaving the queue `drain` scans by `lifecycle === "enqueued"`,
      // so a stale timestamp would be meaningless once it's gone.
      if (enqueuedToExternal) delete next.enqueuedAt;
      // Sync-owned like `linkedPr`: rewritten every sync. Unknown scope (Jira
      // `/myself` failed) keeps the stored reasons rather than blanking the Inbox.
      if (input.sourceStatus) next.sourceStatus = input.sourceStatus;
      else delete next.sourceStatus;
      if (input.scopeReasons) next.scopeReasons = input.scopeReasons;
      // `linkedPr` is only meaningful while the item is `external` — drop it
      // (rather than leaving it stale) once the item returns to `todo` or
      // moves anywhere else. But a GATE-owned lifecycle
      // (enqueued/running/awaiting-merge/failed) is untouched by this sync —
      // its `linkedPr` (set from before ZIBBY picked the item up) must be
      // left exactly as-is too, unless the source now reports it done, or
      // (Important #3) an `enqueued` item just moved to `external` — both
      // are sync transitions that reach even a gate-owned lifecycle.
      const isGateOwned =
        current.lifecycle === "enqueued" ||
        current.lifecycle === "running" ||
        current.lifecycle === "awaiting-merge" ||
        current.lifecycle === "failed";
      if (isGateOwned && input.workState !== "done" && !enqueuedToExternal) {
        // leave `next.linkedPr` (== `current.linkedPr`, via the initial spread) alone
      } else if (nextLifecycle === "external" && input.linkedPr) {
        next.linkedPr = input.linkedPr;
      } else {
        delete next.linkedPr;
      }
      return next;
    });

    return { outcome: "updated", itemId: id, notes };
  }

  /**
   * Decide the item's `attachmentSetId`/`attachments`, applying the caps (25
   * MB per file, 10 files per item — anything over is dropped with a note)
   * and the re-download rule: a set is only (re)downloaded when the source's
   * current within-cap attachment list differs (by `name:size` signature)
   * from what's already stored on the item. An unchanged signature reuses the
   * existing `attachmentSetId` as-is — the source hasn't changed the files,
   * so there is nothing worth re-fetching bytes for. A per-attachment
   * download failure is skipped (noted), not fatal to the whole sync.
   */
  private async resolveAttachments(
    sourceAttachments: readonly NormalizedAttachment[],
    existing: RoadmapItem | null,
  ): Promise<{
    attachmentSetId: string | undefined;
    attachments: RoadmapItem["attachments"];
    notes: string[];
  }> {
    const capped = sourceAttachments.slice(0, MAX_ATTACHMENTS_PER_ITEM);
    const overflow = sourceAttachments.length - capped.length;
    const withinSize = capped.filter((attachment) => attachment.size <= MAX_ATTACHMENT_BYTES);
    const oversize = capped.filter((attachment) => attachment.size > MAX_ATTACHMENT_BYTES);

    const notes: string[] = [];
    for (const skipped of oversize) {
      notes.push(
        `attachment "${skipped.name}" skipped: ${formatMB(skipped.size)} exceeds the 25 MB cap`,
      );
    }
    if (overflow > 0) {
      notes.push(
        `${overflow} attachment(s) skipped: item already has the ${MAX_ATTACHMENTS_PER_ITEM}-attachment cap`,
      );
    }

    if (withinSize.length === 0) {
      return { attachmentSetId: undefined, attachments: [], notes };
    }

    const desiredSignature = attachmentsSignature(withinSize);
    const currentSignature = attachmentsSignature(existing?.attachments ?? []);
    if (existing?.attachmentSetId && desiredSignature === currentSignature) {
      // Nothing changed since the last sync — reuse the existing set rather
      // than re-downloading bytes the source hasn't touched.
      return {
        attachmentSetId: existing.attachmentSetId,
        attachments: existing.attachments,
        notes,
      };
    }

    const files: DownloadedAttachment[] = [];
    for (const attachment of withinSize) {
      try {
        const buffer = await attachment.download();
        files.push({
          originalname: attachment.name,
          size: attachment.size,
          ...(attachment.mediaType ? { mimetype: attachment.mediaType } : {}),
          buffer,
        });
      } catch (error) {
        notes.push(
          `attachment "${attachment.name}" failed to download: ${(error as Error).message}`,
        );
      }
    }
    if (files.length === 0) {
      return { attachmentSetId: undefined, attachments: [], notes };
    }
    const saved = await this.attachments.save(files);
    return { attachmentSetId: saved.attachmentSetId, attachments: saved.files, notes };
  }

  private async downloadBytes(
    url: string | undefined,
    headers: Record<string, string>,
  ): Promise<Buffer> {
    if (!url) throw new Error("no download url");
    const res = await this.fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * An item this integration previously imported, but this sync did NOT see
   * (its `source.externalId` isn't in `seenExternalIds`) — the source no
   * longer returns it (deleted, moved out of the JQL/repo scope, or its
   * level-mapping now resolves to `"ignore"`, which is treated the same as
   * "not returned" since an ignored item is never (re)created). Archived,
   * NEVER deleted — mutates only `lifecycle`/`updatedAt`/`syncedAt`, leaving
   * `runs`/`overrideBlocked`/`origin`/`dependsOn` untouched.
   */
  private async archiveMissing(
    projectId: string,
    integrationId: string,
    seenExternalIds: ReadonlySet<string>,
    summary: RoadmapSyncResult,
  ): Promise<void> {
    const items = await this.roadmap.list(projectId);
    for (const item of items) {
      if (item.source.integrationId !== integrationId) continue;
      if (item.source.externalId === undefined) continue;
      if (seenExternalIds.has(item.source.externalId)) continue;
      if (item.lifecycle === "archived") continue;
      await this.roadmap.update(projectId, item.id, (current) => ({
        ...current,
        lifecycle: "archived",
        updatedAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      }));
      summary.archived += 1;
    }
  }
}
