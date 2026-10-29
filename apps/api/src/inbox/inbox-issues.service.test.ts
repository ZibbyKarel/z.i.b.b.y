import type { InboxPrsResponse, Integration, Project, RoadmapItem } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { RoadmapItemConflictError, RoadmapItemNotFoundError } from "../roadmap/roadmap.errors";
import { InboxIssuesService, InboxItemNotFoundError } from "./inbox-issues.service";
import { InboxService } from "./inbox.service";

const NOW = "2026-10-01T10:00:00.000Z";
const acme: Project = { id: "acme", name: "Acme", path: "~/acme", companyId: "co", teamId: "tm" };
const beta: Project = {
  id: "beta",
  name: "Beta",
  path: "~/beta",
  integrationRouting: [{ integrationId: "j1", match: { kind: "jira", projectKey: "BETA" } }],
};
const jira = {
  id: "j1",
  config: { kind: "jira", baseUrl: "https://x.atlassian.net", email: "me@x.io" },
} as unknown as Integration;
const github = {
  id: "gh",
  config: { kind: "github", repo: "acme/app", username: "me" },
} as unknown as Integration;

const adf = (text: string) => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const issue = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  fields: {
    summary: `Summary ${key}`,
    description: adf(`Body ${key}`),
    issuetype: { name: "Task" },
    status: { name: "To Do", statusCategory: { key: "new" } },
    updated: "2026-10-02T08:00:00.000+0000",
    ...extra,
  },
});
const epic = { key: "ACME-1", fields: { summary: "The epic", issuetype: { name: "Epic" } } };

function localItem(id: string, patch: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id,
    projectId: "acme",
    level: "task",
    name: id,
    description: "",
    source: { kind: "jira", integrationId: "j1", externalId: id },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

interface Opts {
  jiraIssues?: unknown[];
  children?: unknown[];
  ghIssues?: unknown[];
  jiraStatus?: number;
  local?: RoadmapItem[];
  hidden?: { integrationId: string; externalId: string }[];
  prs?: InboxPrsResponse["prs"];
  integrations?: Integration[];
}

function build(opts: Opts = {}) {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchImpl = (async (url: string | URL) => {
    const u = new URL(String(url));
    calls.push(`${u.pathname}?${u.searchParams.get("jql") ?? u.searchParams.get("q") ?? ""}`);
    if (u.pathname === "/rest/api/3/search/jql") {
      if (opts.jiraStatus) return json({ errorMessages: ["nope"] }, opts.jiraStatus);
      const jql = u.searchParams.get("jql") ?? "";
      return json({
        issues: jql.startsWith("parent in") ? (opts.children ?? []) : opts.jiraIssues,
      });
    }
    if (u.pathname === "/search/issues") return json({ items: opts.ghIssues ?? [] });
    throw new Error(`unhandled ${u.pathname}`);
  }) as unknown as typeof fetch;
  const store = new Map((opts.local ?? []).map((i) => [i.id, i]));
  const roadmap = {
    list: async (projectId: string) => [...store.values()].filter((i) => i.projectId === projectId),
    get: async (projectId: string, id: string) => {
      const found = store.get(id);
      if (!found || found.projectId !== projectId)
        throw new RoadmapItemNotFoundError(projectId, id);
      return found;
    },
    put: vi.fn(async (item: RoadmapItem) => {
      if (store.has(item.id)) throw new RoadmapItemConflictError(item.projectId, item.id);
      store.set(item.id, item);
      return item;
    }),
    update: vi.fn(
      async (projectId: string, id: string, mutate: (c: RoadmapItem) => RoadmapItem) => {
        const next = mutate(await roadmap.get(projectId, id));
        store.set(id, next);
        return next;
      },
    ),
  };
  const gate = { play: vi.fn(async (projectId: string, id: string) => roadmap.get(projectId, id)) };
  const prs: InboxPrsResponse = { prs: opts.prs ?? [], errors: [] };
  const getPrs = vi.fn(async () => prs);
  const service = new InboxIssuesService(
    { list: async () => [acme, beta] } as never,
    {
      resolveIntegrations: async (p: Project) =>
        (opts.integrations ?? [jira, ...(p.id === "acme" ? [github] : [])]).filter(
          (i) => p.id === "acme" || i.config.kind === "jira",
        ),
    } as never,
    { read: async () => ({ token: "tok" }) } as never,
    roadmap as never,
    { read: async () => ({ hidden: opts.hidden ?? [] }) } as never,
    gate as never,
    fetchImpl,
  );
  return { service, calls, roadmap, gate, getPrs };
}

describe("InboxIssuesService.list", () => {
  it("maps Jira issues, groups by epic with done/total, and queries once for both projects", async () => {
    const { service, calls } = build({
      jiraIssues: [
        issue("ACME-5", { parent: epic }),
        issue("ACME-6", {
          parent: { key: "ACME-2", fields: { summary: "Story", issuetype: { name: "Story" } } },
          status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        }),
      ],
      children: [
        {
          key: "ACME-5",
          fields: { parent: { key: "ACME-1" }, status: { statusCategory: { key: "done" } } },
        },
        {
          key: "ACME-7",
          fields: { parent: { key: "ACME-1" }, status: { statusCategory: { key: "new" } } },
        },
        {
          key: "ACME-8",
          fields: { parent: { key: "ACME-1" }, status: { statusCategory: { key: "done" } } },
        },
      ],
    });
    const res = await service.list(false, async () => ({ prs: [], errors: [] }));
    expect(calls.filter((c) => c.startsWith("/rest/api/3/search/jql?assignee"))).toEqual([
      "/rest/api/3/search/jql?assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
    ]);
    expect(res.syncProjectIds).toEqual(["acme", "beta"]);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toMatchObject({
      id: "j1-acme-5",
      projectId: "acme",
      name: "Summary ACME-5",
      description: "Body ACME-5",
      level: "task",
      lifecycle: "todo",
      parentId: "j1-acme-1",
      hidden: false,
      project: { id: "acme", name: "Acme" },
      companyId: "co",
      teamId: "tm",
      source: {
        kind: "jira",
        integrationId: "j1",
        externalId: "ACME-5",
        externalKey: "ACME-5",
        url: "https://x.atlassian.net/browse/ACME-5",
      },
      sourceStatus: { name: "To Do", done: false },
    });
    // a non-Epic parent is not an epic; "In Progress" is someone else's work
    expect(res.items[1]).toMatchObject({ lifecycle: "external", name: "Summary ACME-6" });
    expect(res.items[1]?.parentId).toBeUndefined();
    expect(res.epics).toEqual([
      {
        id: "j1-acme-1",
        projectId: "acme",
        key: "ACME-1",
        title: "The epic",
        source: "jira",
        url: "https://x.atlassian.net/browse/ACME-1",
        done: 2,
        total: 3,
      },
    ]);
    expect(res.errors).toEqual([]);
    expect(res.syncedAt).toBeDefined();
  });

  it("treats hierarchyLevel 1 as an epic whatever its type is called", async () => {
    const { service } = build({
      jiraIssues: [
        issue("ACME-5", {
          parent: {
            key: "ACME-1",
            fields: { summary: "Initiative", issuetype: { name: "Initiative", hierarchyLevel: 1 } },
          },
        }),
      ],
    });
    const res = await service.list(false, async () => ({ prs: [], errors: [] }));
    expect(res.items[0]?.parentId).toBe("j1-acme-1");
    expect(res.epics[0]).toMatchObject({ key: "ACME-1", done: 0, total: 0 });
  });

  it("assigns an issue to the project whose routing rule names its key prefix, else the first", async () => {
    const { service } = build({ jiraIssues: [issue("BETA-1"), issue("ZZZ-9")] });
    const res = await service.list(false, async () => ({ prs: [], errors: [] }));
    expect(Object.fromEntries(res.items.map((i) => [i.source.externalKey, i.projectId]))).toEqual({
      "BETA-1": "beta",
      "ZZZ-9": "acme",
    });
  });

  it("overlays the local record: runs and ZIBBY lifecycle win; on-disk-only items are not listed", async () => {
    const run = { taskId: "t1", startedAt: NOW, outcome: "running" as const };
    const { service } = build({
      jiraIssues: [issue("ACME-5"), issue("ACME-6")],
      local: [
        localItem("j1-acme-5", { lifecycle: "running", runs: [run], dependsOn: ["j1-acme-6"] }),
        localItem("j1-acme-6", { lifecycle: "done" }), // not a ZIBBY in-flight state: remote wins
        localItem("j1-acme-99", { lifecycle: "todo" }), // no longer assigned
      ],
    });
    const res = await service.list(false, async () => ({ prs: [], errors: [] }));
    expect(res.items.map((i) => i.id)).toEqual(["j1-acme-5", "j1-acme-6"]);
    expect(res.items[0]).toMatchObject({
      lifecycle: "running",
      runs: [run],
      dependsOn: ["j1-acme-6"],
    });
    expect(res.items[1]).toMatchObject({ lifecycle: "todo", runs: [] });
  });

  it("flags a hidden item", async () => {
    const { service } = build({
      jiraIssues: [issue("ACME-5"), issue("ACME-6")],
      hidden: [{ integrationId: "j1", externalId: "ACME-6" }],
    });
    const res = await service.list(false, async () => ({ prs: [], errors: [] }));
    expect(res.items.map((i) => i.hidden)).toEqual([false, true]);
  });

  it("links an open PR naming the key (word boundary, title or branch, same project)", async () => {
    const pr = (number: number, title: string, headRef?: string, projectId = "acme") =>
      ({
        number,
        title,
        url: `https://github.com/acme/app/pull/${number}`,
        headRef,
        projectId,
      }) as never;
    const { service, getPrs } = build({
      jiraIssues: [issue("ACME-5"), issue("ACME-12"), issue("ACME-7")],
      prs: [pr(1, "acme-12: other"), pr(2, "Fix ACME-5 login"), pr(3, "x", "acme-7-thing", "beta")],
    });
    const res = await service.list(false, getPrs);
    const byKey = Object.fromEntries(res.items.map((i) => [i.source.externalKey, i.linkedPr]));
    expect(byKey["ACME-5"]).toEqual({
      number: 2,
      url: "https://github.com/acme/app/pull/2",
      title: "Fix ACME-5 login",
    });
    expect(byKey["ACME-12"]).toMatchObject({ number: 1 });
    expect(byKey["ACME-7"]).toBeUndefined(); // the PR lives in another project
  });

  it("a failing PR list only drops the links", async () => {
    const { service } = build({ jiraIssues: [issue("ACME-5")] });
    const res = await service.list(false, async () => {
      throw new Error("github down");
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.linkedPr).toBeUndefined();
  });

  it("one failing integration yields an error entry; the other source still lists", async () => {
    const { service } = build({
      jiraStatus: 500,
      ghIssues: [
        {
          number: 42,
          title: "Gh bug",
          body: "details",
          html_url: "https://github.com/acme/app/issues/42",
        },
      ],
    });
    const res = await service.list(false, async () => ({ prs: [], errors: [] }));
    expect(res.errors).toEqual([
      { projectId: "acme", source: "jira", message: "j1: jira search: nope" },
    ]);
    expect(res.items).toHaveLength(1);
  });

  it("maps GitHub issues (PRs in the search result are skipped, no epic)", async () => {
    const { service, calls } = build({
      integrations: [github],
      ghIssues: [
        {
          number: 42,
          title: "Gh bug",
          body: "details",
          html_url: "https://github.com/acme/app/issues/42",
          updated_at: "2026-10-03T00:00:00Z",
        },
        { number: 43, title: "A PR", pull_request: {} },
      ],
    });
    const res = await service.list(false, async () => ({ prs: [], errors: [] }));
    expect(calls).toContain("/search/issues?is:issue is:open assignee:@me repo:acme/app");
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      id: "gh-issue-42",
      projectId: "acme",
      name: "Gh bug",
      description: "details",
      level: "task",
      lifecycle: "todo",
      source: {
        kind: "github",
        integrationId: "gh",
        externalId: "issue:42",
        externalKey: "#42",
        url: "https://github.com/acme/app/issues/42",
      },
    });
    expect(res.items[0]?.parentId).toBeUndefined();
    expect(res.epics).toEqual([]);
  });

  it("caches the list for 60 s; refresh and dropCache bypass it", async () => {
    const { service, calls } = build({ jiraIssues: [issue("ACME-5")] });
    const getPrs = async () => ({ prs: [], errors: [] });
    const jiraCalls = () => calls.filter((c) => c.includes("assignee = currentUser")).length;
    await service.list(false, getPrs);
    await service.list(false, getPrs);
    expect(jiraCalls()).toBe(1);
    await service.list(true, getPrs);
    expect(jiraCalls()).toBe(2);
    await service.list(false, getPrs);
    expect(jiraCalls()).toBe(2);
    service.dropCache();
    await service.list(false, getPrs);
    expect(jiraCalls()).toBe(3);
  });
});

describe("InboxIssuesService.process / InboxService.processItem", () => {
  const live = {
    id: "j1-acme-5",
    projectId: "acme",
    level: "task",
    name: "Summary ACME-5",
    description: "Body",
    source: { kind: "jira", integrationId: "j1", externalId: "ACME-5", externalKey: "ACME-5" },
    lifecycle: "todo",
  } as never;

  it("creates a minimal local record when missing, then plays it", async () => {
    const { service, roadmap, gate } = build();
    await service.process(live);
    expect(roadmap.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "j1-acme-5",
        projectId: "acme",
        name: "Summary ACME-5",
        description: "Body",
        level: "task",
        lifecycle: "todo",
        source: expect.objectContaining({ integrationId: "j1", externalId: "ACME-5" }),
      }),
    );
    expect(gate.play).toHaveBeenCalledWith("acme", "j1-acme-5");
  });

  it("refreshes a stale existing record (old sync snapshot) from the live issue before playing", async () => {
    const stale = localItem("j1-acme-5", { name: "Old", lifecycle: "external" });
    const { service, roadmap, gate } = build({ local: [stale] });
    await service.process(live);
    await expect(roadmap.get("acme", "j1-acme-5")).resolves.toMatchObject({
      name: "Summary ACME-5",
      description: "Body",
      lifecycle: "todo",
    });
    expect(gate.play).toHaveBeenCalledTimes(1);
  });

  it("leaves a record ZIBBY is working on untouched", async () => {
    const running = localItem("j1-acme-5", { name: "Mine", lifecycle: "running" });
    const { service, roadmap } = build({ local: [running] });
    await service.process({ ...(live as object), lifecycle: "running" } as never);
    await expect(roadmap.get("acme", "j1-acme-5")).resolves.toMatchObject({
      name: "Mine",
      lifecycle: "running",
    });
  });

  it("processItem 404s (InboxItemNotFoundError) for an item that is not in the live list", async () => {
    const issues = {
      list: async () => ({ items: [{ ...(live as object) }] }),
      process: vi.fn(),
      dropCache: () => undefined,
    };
    const service = new InboxService(
      {} as never,
      {} as never,
      {} as never,
      issues as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.processItem("acme", "nope")).rejects.toBeInstanceOf(
      InboxItemNotFoundError,
    );
    await service.processItem("acme", "j1-acme-5");
    expect(issues.process).toHaveBeenCalledTimes(1);
  });
});
