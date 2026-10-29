import { Injectable, Optional } from "@nestjs/common";
import {
  type InboxEpic,
  type InboxItemsResponse,
  type InboxPr,
  type InboxPrsResponse,
  type InboxRoadmapItem,
  type InboxSourceError,
  type Integration,
  type JiraConfig,
  type Project,
  type RoadmapItem,
  type RoadmapItemLifecycle,
  type RoadmapLinkedPr,
  roadmapItemIdForSource,
} from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { type JiraIssue, jiraAuthHeader, searchJira, tokenOf } from "../integrations/jira-client";
import { resolveGithubToken } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { adfToMarkdown } from "../roadmap/adf-to-markdown";
import { RoadmapGateService } from "../roadmap/roadmap-gate.service";
import { RoadmapItemConflictError, RoadmapItemNotFoundError } from "../roadmap/roadmap.errors";
import { RoadmapStore } from "../roadmap/roadmap.store";
import { InboxStateStore } from "./inbox-state.store";

const GITHUB_API = "https://api.github.com";
const ISSUES_TTL_MS = 60_000;
/** ZIBBY's own lifecycle states: once a local record is in one of these it beats the remote status. */
const ZIBBY_LIFECYCLES: readonly RoadmapItemLifecycle[] = [
  "enqueued",
  "running",
  "awaiting-merge",
  "failed",
];

/** The live list has no item with this project + id (never fetched, no longer assigned, or hidden by a failure). */
export class InboxItemNotFoundError extends Error {
  constructor(projectId: string, itemId: string) {
    super(`Inbox item "${itemId}" (project "${projectId}") is not in the live issue list`);
    this.name = "InboxItemNotFoundError";
  }
}

type LiveList = Omit<InboxItemsResponse, "items"> & { items: Omit<InboxRoadmapItem, "hidden">[] };
type JiraIntegration = Integration & { config: JiraConfig };

/** The fields the live fetch owns; everything else on an item is local or defaulted. */
type RemoteIssue = Pick<
  RoadmapItem,
  | "id"
  | "projectId"
  | "level"
  | "parentId"
  | "name"
  | "description"
  | "source"
  | "lifecycle"
  | "sourceStatus"
  | "linkedPr"
  | "scopeReasons"
> & { updatedAt?: string };

const hiddenKey = (integrationId: string, externalId: string) =>
  `${integrationId}\u0000${externalId}`;

/** Whole-token, case-insensitive match of an issue key in a PR title or head branch (`PROJ-1` never matches `PROJ-12`). */
function findLinkedPr(key: string, pulls: readonly InboxPr[]): RoadmapLinkedPr | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?![0-9])`, "i");
  const pr = pulls.find((p) => re.test(p.title) || re.test(p.headRef ?? ""));
  return pr ? { number: pr.number, url: pr.url, title: pr.title } : undefined;
}

const isEpic = (type: { name?: string; hierarchyLevel?: number } | undefined) =>
  type?.hierarchyLevel === 1 || /^epic$/i.test(type?.name ?? "");

/** The project that owns a Jira issue: a routing rule / integration `projectKey` matching the key prefix, else the first. */
function ownerOf(key: string, integration: JiraIntegration, projects: readonly Project[]): Project {
  const prefix = key.replace(/-\d+$/, "").toLowerCase();
  const owner = projects.find(
    (p) =>
      integration.config.projectKey?.toLowerCase() === prefix ||
      (p.integrationRouting ?? []).some(
        (rule) =>
          rule.integrationId === integration.id &&
          rule.match.kind === "jira" &&
          rule.match.projectKey?.toLowerCase() === prefix,
      ),
  );
  return owner ?? (projects[0] as Project);
}

/**
 * The Issues widget's data (docs/plans/live-issues-plan.md): issues assigned to the operator,
 * fetched live from Jira and GitHub, never copied to disk. A roadmap-store item with the same id
 * is ZIBBY's own work record and overlays the remote fields. `fetchImpl` is injectable.
 */
@Injectable()
export class InboxIssuesService {
  private readonly fetchImpl: typeof fetch;
  private cache: { at: number; value: Promise<LiveList> } | null = null;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly roadmap: RoadmapStore,
    private readonly state: InboxStateStore,
    private readonly gate: RoadmapGateService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  dropCache(): void {
    this.cache = null;
  }

  /** `getPrs` supplies the (cached) PR list for `linkedPr`; its failure only drops the links. */
  async list(
    refresh: boolean,
    getPrs: () => Promise<InboxPrsResponse>,
  ): Promise<InboxItemsResponse> {
    let live = this.cache;
    if (refresh || !live || Date.now() - live.at >= ISSUES_TTL_MS) {
      const value = this.fetchLive(getPrs);
      this.cache = live = { at: Date.now(), value };
      value.catch(() => {
        if (this.cache === live) this.cache = null;
      });
    }
    const [base, state] = await Promise.all([live.value, this.state.read()]);
    const hidden = new Set(state.hidden.map((k) => hiddenKey(k.integrationId, k.externalId)));
    return {
      ...base,
      items: base.items.map((item) => ({
        ...item,
        hidden: hidden.has(
          hiddenKey(item.source.integrationId ?? "", item.source.externalId ?? ""),
        ),
      })),
    };
  }

  /** Write a minimal local work record for a live issue if none exists, then play it. */
  async process(item: InboxRoadmapItem): Promise<RoadmapItem> {
    try {
      await this.roadmap.get(item.projectId, item.id);
    } catch (error) {
      if (!(error instanceof RoadmapItemNotFoundError)) throw error;
      const now = new Date().toISOString();
      await this.roadmap
        .put({
          id: item.id,
          projectId: item.projectId,
          level: "task",
          name: item.name,
          description: item.description,
          source: item.source,
          attachments: [],
          dependsOn: [],
          dependsOnFromSource: [],
          // Fail-closed like the old sync: an issue someone else is on stays `external`, so play refuses it.
          lifecycle: item.lifecycle === "external" ? "external" : "todo",
          runs: [],
          syncNotes: [],
          createdAt: now,
          updatedAt: now,
        })
        .catch((e: unknown) => {
          if (!(e instanceof RoadmapItemConflictError)) throw e;
        });
    }
    return this.gate.play(item.projectId, item.id);
  }

  private async fetchLive(getPrs: () => Promise<InboxPrsResponse>): Promise<LiveList> {
    const projects = await this.projects.list();
    const errors: InboxSourceError[] = [];
    const syncProjectIds: string[] = [];
    const jira = new Map<string, { integration: JiraIntegration; projects: Project[] }>();
    const repos = new Map<string, { project: Project; integrationId: string; token: string }>();
    for (const project of projects) {
      const integrations = await this.resolvedProjects.resolveIntegrations(project);
      if (integrations.some((i) => i.config.kind === "jira" || i.config.kind === "github")) {
        syncProjectIds.push(project.id);
      }
      for (const integration of integrations) {
        if (integration.config.kind === "jira") {
          const entry = jira.get(integration.id);
          if (entry) entry.projects.push(project);
          else
            jira.set(integration.id, {
              integration: integration as JiraIntegration,
              projects: [project],
            });
        }
      }
      const github = integrations.find((i) => i.config.kind === "github");
      const link = github
        ? await resolveGithubToken(this.resolvedProjects, this.credentials, project)
        : null;
      if (github && link && !repos.has(link.repo)) {
        repos.set(link.repo, { project, integrationId: github.id, token: link.token });
      }
    }

    const items: Omit<InboxRoadmapItem, "hidden">[] = [];
    const epics = new Map<string, InboxEpic>();
    const prs = await getPrs().then(
      (r) => r.prs,
      () => [],
    );
    const overlays = new Map<string, Map<string, RoadmapItem>>();
    const overlayOf = async (projectId: string) => {
      let byId = overlays.get(projectId);
      if (!byId) {
        byId = new Map((await this.roadmap.list(projectId)).map((i) => [i.id, i]));
        overlays.set(projectId, byId);
      }
      return byId;
    };
    const push = async (project: Project, remote: RemoteIssue) => {
      const local = (await overlayOf(project.id)).get(remote.id);
      const now = new Date().toISOString();
      const lifecycle =
        local && ZIBBY_LIFECYCLES.includes(local.lifecycle) ? local.lifecycle : remote.lifecycle;
      items.push({
        ...remote,
        lifecycle,
        attachments: [],
        dependsOn: local?.dependsOn ?? [],
        dependsOnFromSource: [],
        runs: local?.runs ?? [],
        syncNotes: [],
        ...(local?.lastFailureReason ? { lastFailureReason: local.lastFailureReason } : {}),
        ...(local?.overrideBlocked !== undefined ? { overrideBlocked: local.overrideBlocked } : {}),
        ...(local?.enqueuedAt ? { enqueuedAt: local.enqueuedAt } : {}),
        ...(local?.output ? { output: local.output } : {}),
        createdAt: local?.createdAt ?? remote.updatedAt ?? now,
        updatedAt: remote.updatedAt ?? now,
        project: { id: project.id, name: project.name },
        ...(project.companyId ? { companyId: project.companyId } : {}),
        ...(project.teamId ? { teamId: project.teamId } : {}),
      });
    };

    for (const { integration, projects: owners } of jira.values()) {
      try {
        const token = tokenOf(await this.credentials.read(integration.id));
        if (!token) continue; // no credentials configured — nothing to fetch
        const { baseUrl } = integration.config;
        const auth = jiraAuthHeader(integration.config, token);
        const issues = await searchJira(
          this.fetchImpl,
          baseUrl,
          auth,
          "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
          "summary,description,issuetype,parent,status,updated",
        );
        const progress = await this.epicProgress(baseUrl, auth, issues);
        for (const issue of issues) {
          const key = issue.key;
          if (!key) continue;
          const project = ownerOf(key, integration, owners);
          const fields = issue.fields;
          const parent = fields?.parent;
          const epicKey = parent?.key && isEpic(parent.fields?.issuetype) ? parent.key : undefined;
          const epicId = epicKey ? roadmapItemIdForSource(integration.id, epicKey) : undefined;
          if (epicKey && epicId && !epics.has(`${project.id}/${epicId}`)) {
            const counts = progress.get(epicKey) ?? { done: 0, total: 0 };
            epics.set(`${project.id}/${epicId}`, {
              id: epicId,
              projectId: project.id,
              key: epicKey,
              title: parent?.fields?.summary ?? epicKey,
              source: "jira",
              url: `${baseUrl}/browse/${epicKey}`,
              ...counts,
            });
          }
          const id = roadmapItemIdForSource(integration.id, key);
          const status = fields?.status;
          const linkedPr = findLinkedPr(
            key,
            prs.filter((p) => p.projectId === project.id),
          );
          await push(project, {
            id,
            projectId: project.id,
            level: "task",
            ...(epicId ? { parentId: epicId } : {}),
            name: (fields?.summary ?? key).slice(0, 512),
            description: adfToMarkdown(fields?.description ?? null),
            source: {
              kind: "jira",
              integrationId: integration.id,
              externalId: key,
              externalKey: key,
              url: `${baseUrl}/browse/${key}`,
            },
            lifecycle: status?.statusCategory?.key === "new" ? "todo" : "external",
            ...(status?.name ? { sourceStatus: { name: status.name, done: false } } : {}),
            ...(linkedPr ? { linkedPr } : {}),
            scopeReasons: ["assigned"],
            ...(fields?.updated ? { updatedAt: new Date(fields.updated).toISOString() } : {}),
          });
        }
      } catch (error) {
        errors.push({
          projectId: owners[0]?.id ?? "",
          source: "jira",
          message: `${integration.id}: ${(error as Error).message || "unknown error"}`,
        });
      }
    }

    for (const [repo, { project, integrationId, token }] of repos) {
      try {
        const params = new URLSearchParams({
          q: `is:issue is:open assignee:@me repo:${repo}`,
          per_page: "100", // ponytail: first 100 assigned issues per repo
        });
        const res = await this.fetchImpl(`${GITHUB_API}/search/issues?${params}`, {
          headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
        });
        if (!res.ok) throw new Error(`github issues: HTTP ${res.status}`);
        const body = (await res.json()) as {
          items?: {
            number?: number;
            title?: string;
            body?: string | null;
            html_url?: string;
            updated_at?: string;
            pull_request?: unknown;
          }[];
        };
        for (const issue of body.items ?? []) {
          if (issue.number === undefined || issue.pull_request !== undefined) continue;
          const externalId = `issue:${issue.number}`;
          await push(project, {
            id: roadmapItemIdForSource(integrationId, externalId),
            projectId: project.id,
            level: "task",
            name: (issue.title ?? `#${issue.number}`).slice(0, 512),
            description: issue.body ?? "",
            source: {
              kind: "github",
              integrationId,
              externalId,
              externalKey: `#${issue.number}`,
              ...(issue.html_url ? { url: issue.html_url } : {}),
            },
            lifecycle: "todo",
            sourceStatus: { name: "open", done: false },
            scopeReasons: ["assigned"],
            ...(issue.updated_at ? { updatedAt: new Date(issue.updated_at).toISOString() } : {}),
          });
        }
      } catch (error) {
        errors.push({
          projectId: project.id,
          source: "github",
          message: `${repo}: ${(error as Error).message || "unknown error"}`,
        });
      }
    }

    return {
      items,
      epics: [...epics.values()],
      syncProjectIds,
      syncedAt: new Date().toISOString(),
      errors,
    };
  }

  /** done/total per epic key over every child (one `parent in (...)` JQL; done = status category "done"). */
  private async epicProgress(
    baseUrl: string,
    auth: string,
    issues: readonly JiraIssue[],
  ): Promise<Map<string, { done: number; total: number }>> {
    const keys = [
      ...new Set(
        issues.flatMap((i) =>
          i.fields?.parent?.key && isEpic(i.fields.parent.fields?.issuetype)
            ? [i.fields.parent.key]
            : [],
        ),
      ),
    ];
    const progress = new Map<string, { done: number; total: number }>();
    if (keys.length === 0) return progress;
    // ponytail: one query for every epic; split by chunks if an operator ever has hundreds of epics.
    const children = await searchJira(
      this.fetchImpl,
      baseUrl,
      auth,
      `parent in (${keys.join(",")})`,
      "status,parent",
    );
    for (const child of children) {
      const parentKey = child.fields?.parent?.key;
      if (!parentKey) continue;
      const counts = progress.get(parentKey) ?? { done: 0, total: 0 };
      counts.total += 1;
      if (child.fields?.status?.statusCategory?.key === "done") counts.done += 1;
      progress.set(parentKey, counts);
    }
    return progress;
  }
}
