import type { Integration, Project, ProjectPr } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { MaestroService } from "./maestro.service";

const ACME: Project = { id: "acme", name: "Acme", path: "~/Projects/acme" };
const BETA: Project = { id: "beta", name: "Beta", path: "~/Projects/beta" };

function githubIntegration(projectId: string, repo: string): Integration {
  return {
    id: `${projectId}-github`,
    kind: "github",
    projectId,
    enabled: true,
    status: "connected",
    hasCredentials: true,
    config: { kind: "github", repo, streams: ["issues", "pulls"], username: "octocat" },
  };
}

function pr(over: Partial<ProjectPr> = {}): ProjectPr {
  return {
    number: 1,
    title: "Some change",
    url: "https://github.com/acme/app/pull/1",
    author: "alice",
    branch: "feat/x",
    draft: false,
    createdAt: "2026-07-17T00:00:00.000Z",
    ...over,
  };
}

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

interface BuildOpts {
  projects?: Project[];
  integrationsByProject?: Record<string, Integration[]>;
  prsByProject?: Record<string, ProjectPr[]>;
  fetchImpl?: typeof fetch;
}

function build(opts: BuildOpts) {
  const projects = opts.projects ?? [ACME];
  const integrationsByProject = opts.integrationsByProject ?? {
    acme: [githubIntegration("acme", "acme/app")],
  };
  const prsByProject = opts.prsByProject ?? { acme: [pr()] };

  const projectsStore = { list: async () => projects };
  const resolvedProjects = {
    resolveIntegrations: async (project: Project) => integrationsByProject[project.id] ?? [],
  };
  const credentials = { read: async () => ({ token: "ghp_x" }) };
  const projectPr = {
    listOpen: vi.fn(async (projectId: string) => prsByProject[projectId] ?? []),
  };
  const logger = {
    child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
  };

  const service = new MaestroService(
    projectsStore as never,
    resolvedProjects as never,
    credentials as never,
    projectPr as never,
    logger as never,
    opts.fetchImpl,
  );
  return { service, projectPr };
}

type Route = { match: RegExp; respond: () => Response | Promise<Response> };

/** A dispatching fetch stub: every route is checked, first ANCHORED match wins —
 *  each helper below anchors its pattern with `$` so `/pulls/1` never accidentally
 *  matches `/pulls/1/reviews`. */
function routedFetch(routes: Route[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = routes.find((route) => route.match.test(url));
    if (!hit) throw new Error(`unrouted fetch: ${url}`);
    return hit.respond();
  }) as unknown as typeof fetch;
}

function pullDetailRoute(number: number, body: unknown): Route {
  return { match: new RegExp(`/pulls/${number}$`), respond: () => jsonResponse(200, body) };
}
function checkRunsRoute(sha: string, body: unknown): Route {
  return {
    match: new RegExp(`/commits/${sha}/check-runs$`),
    respond: () => jsonResponse(200, body),
  };
}
function reviewsRoute(number: number, body: unknown): Route {
  return {
    match: new RegExp(`/pulls/${number}/reviews$`),
    respond: () => jsonResponse(200, body),
  };
}

const PASSING_CHECKS = { check_runs: [{ status: "completed", conclusion: "success" }] };
const APPROVED_REVIEW = [{ state: "APPROVED", user: { login: "bob" }, submitted_at: "2026-07-16" }];

function readyRoutes(number = 1, sha = "sha1"): Route[] {
  return [
    pullDetailRoute(number, { mergeable: true, head: { sha } }),
    checkRunsRoute(sha, PASSING_CHECKS),
    reviewsRoute(number, APPROVED_REVIEW),
  ];
}

describe("MaestroService.queue", () => {
  it("passing checks + approved + mergeable + fresh → ready", async () => {
    const { service } = build({ fetchImpl: routedFetch(readyRoutes()) });
    const { entries } = await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      checkState: "passing",
      reviewState: "approved",
      mergeable: "mergeable",
      queueState: "ready",
    });
  });

  it("failing checks → blocked", async () => {
    const { service } = build({
      fetchImpl: routedFetch([
        pullDetailRoute(1, { mergeable: true, head: { sha: "sha1" } }),
        checkRunsRoute("sha1", { check_runs: [{ status: "completed", conclusion: "failure" }] }),
        reviewsRoute(1, APPROVED_REVIEW),
      ]),
    });
    const { entries } = await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    expect(entries[0]).toMatchObject({ checkState: "failing", queueState: "blocked" });
  });

  it("changes requested → blocked", async () => {
    const { service } = build({
      fetchImpl: routedFetch([
        pullDetailRoute(1, { mergeable: true, head: { sha: "sha1" } }),
        checkRunsRoute("sha1", PASSING_CHECKS),
        reviewsRoute(1, [
          { state: "CHANGES_REQUESTED", user: { login: "bob" }, submitted_at: "2026-07-16" },
        ]),
      ]),
    });
    const { entries } = await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    expect(entries[0]).toMatchObject({ reviewState: "changes_requested", queueState: "blocked" });
  });

  it("conflicting mergeability → blocked", async () => {
    const { service } = build({
      fetchImpl: routedFetch([
        pullDetailRoute(1, { mergeable: false, head: { sha: "sha1" } }),
        checkRunsRoute("sha1", PASSING_CHECKS),
        reviewsRoute(1, APPROVED_REVIEW),
      ]),
    });
    const { entries } = await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    expect(entries[0]).toMatchObject({ mergeable: "conflicting", queueState: "blocked" });
  });

  it("a draft PR is blocked even with passing checks + approval", async () => {
    const { service } = build({
      prsByProject: { acme: [pr({ draft: true })] },
      fetchImpl: routedFetch(readyRoutes()),
    });
    const { entries } = await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    expect(entries[0]).toMatchObject({ queueState: "blocked" });
  });

  it("an old, non-ready PR (>14d) is stale; ordering is ready → blocked → stale", async () => {
    const { service } = build({
      prsByProject: {
        acme: [
          pr({ number: 1, createdAt: "2026-07-17T00:00:00.000Z" }), // ready
          pr({ number: 2, createdAt: "2026-07-16T00:00:00.000Z" }), // blocked (pending checks)
          pr({ number: 3, createdAt: "2026-06-01T00:00:00.000Z" }), // stale (pending checks, old)
        ],
      },
      fetchImpl: routedFetch([
        ...readyRoutes(1, "sha1"),
        pullDetailRoute(2, { mergeable: true, head: { sha: "sha2" } }),
        checkRunsRoute("sha2", { check_runs: [{ status: "in_progress" }] }),
        reviewsRoute(2, []),
        pullDetailRoute(3, { mergeable: true, head: { sha: "sha3" } }),
        checkRunsRoute("sha3", { check_runs: [{ status: "in_progress" }] }),
        reviewsRoute(3, []),
      ]),
    });
    const { entries } = await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    expect(entries.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.queueState)).toEqual(["ready", "blocked", "stale"]);
  });

  it("no github link → the project contributes nothing, no error", async () => {
    const { service } = build({ integrationsByProject: { acme: [] } });
    const { entries } = await service.queue({}, new Date());
    expect(entries).toEqual([]);
  });

  it("one repo's enrich throws → other repos still in queue; that repo's PR degrades to unknown/blocked", async () => {
    const { service } = build({
      projects: [ACME, BETA],
      integrationsByProject: {
        acme: [githubIntegration("acme", "acme/app")],
        beta: [githubIntegration("beta", "beta/app")],
      },
      prsByProject: {
        acme: [pr({ number: 1 })],
        beta: [pr({ number: 1 })],
      },
      fetchImpl: routedFetch([
        {
          match: /acme\/app\/pulls\/1$/,
          respond: () => {
            throw new Error("network blip");
          },
        },
        { match: /acme\/app\/pulls\/1\/reviews$/, respond: () => jsonResponse(200, []) },
        {
          match: /beta\/app\/pulls\/1$/,
          respond: () => jsonResponse(200, { mergeable: true, head: { sha: "sha1" } }),
        },
        {
          match: /beta\/app\/commits\/sha1\/check-runs$/,
          respond: () => jsonResponse(200, PASSING_CHECKS),
        },
        {
          match: /beta\/app\/pulls\/1\/reviews$/,
          respond: () => jsonResponse(200, APPROVED_REVIEW),
        },
      ]),
    });
    const { entries } = await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    expect(entries).toHaveLength(2);
    const acmeEntry = entries.find((e) => e.projectId === "acme");
    const betaEntry = entries.find((e) => e.projectId === "beta");
    expect(acmeEntry).toMatchObject({
      mergeable: "unknown",
      checkState: "unknown",
      queueState: "blocked",
    });
    expect(betaEntry).toMatchObject({ queueState: "ready" });
  });

  it("never calls a PUT (no merge code in this service)", async () => {
    const fetchImpl = routedFetch(readyRoutes());
    const { service } = build({ fetchImpl });
    await service.queue({}, new Date("2026-07-17T06:00:00.000Z"));
    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls as Array<
      [RequestInfo | URL, RequestInit?]
    >;
    for (const [, init] of calls) {
      expect(init?.method).not.toBe("PUT");
    }
  });

  it("?projectId= filters to one project", async () => {
    const { service } = build({
      projects: [ACME, BETA],
      integrationsByProject: { acme: [githubIntegration("acme", "acme/app")], beta: [] },
      prsByProject: { acme: [pr()] },
      fetchImpl: routedFetch(readyRoutes()),
    });
    const { entries } = await service.queue(
      { projectId: "acme" },
      new Date("2026-07-17T06:00:00.000Z"),
    );
    expect(entries.every((e) => e.projectId === "acme")).toBe(true);
  });
});

describe("MaestroService.summaryLines", () => {
  it("summarizes one line per project with open PRs", async () => {
    const { service } = build({ fetchImpl: routedFetch(readyRoutes()) });
    const lines = await service.summaryLines();
    expect(lines).toEqual(["Acme: 1 ready"]);
  });

  it("no open PRs anywhere → no lines", async () => {
    const { service } = build({ prsByProject: { acme: [] } });
    expect(await service.summaryLines()).toEqual([]);
  });
});
