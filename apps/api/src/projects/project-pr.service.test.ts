import type { Integration, Project } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  NoGithubLinkError,
  PrNotMergeableError,
  PrUpdateRefusedError,
  ProjectNotFoundError,
} from "./projects.errors";
import { ProjectPrService } from "./project-pr.service";

const PROJECT: Project = { id: "acme", name: "acme", path: "~/Projects/acme" };

const GITHUB_INTEGRATION: Integration = {
  id: "acme-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"], username: "octocat" },
};

const SLACK_INTEGRATION: Integration = {
  id: "acme-slack",
  kind: "slack",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: false,
  config: { kind: "slack", channels: [] },
};

const pull = (over: Record<string, unknown> = {}) => ({
  number: 42,
  title: "Fix flaky test",
  html_url: "https://github.com/acme/app/pull/42",
  user: { login: "alice" },
  head: { ref: "fix/flaky-test" },
  draft: false,
  created_at: "2026-07-01T09:00:00Z",
  ...over,
});

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function build(opts: {
  projects?: Record<string, Project>;
  integrations?: Integration[];
  token?: string | null;
  fetchImpl?: typeof fetch;
  activity?: { record: (input: unknown) => Promise<void> };
  roadmapGate?: { onMerge: (projectId: string, prNumber: number) => Promise<void> };
}) {
  const projects = opts.projects ?? { [PROJECT.id]: PROJECT };
  const integrations = opts.integrations ?? [GITHUB_INTEGRATION];
  const projectsStore = {
    get: async (id: string) => {
      const found = projects[id];
      if (!found) throw new ProjectNotFoundError(id);
      return found;
    },
  };
  const resolvedProjects = { resolveIntegrations: async () => integrations };
  const credentials = {
    read: async () =>
      opts.token === undefined ? { token: "ghp_x" } : opts.token ? { token: opts.token } : null,
  };
  const activity = opts.activity ?? { record: async () => {} };
  const roadmapGate = opts.roadmapGate ?? { onMerge: async () => {} };
  return new ProjectPrService(
    projectsStore as never,
    resolvedProjects as never,
    credentials as never,
    activity as never,
    roadmapGate as never,
    opts.fetchImpl,
  );
}

describe("ProjectPrService", () => {
  describe("listOpen", () => {
    it("maps GitHub's pulls JSON to ProjectPr[]", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(200, [pull()])) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      const prs = await service.listOpen("acme");
      expect(prs).toEqual([
        {
          number: 42,
          title: "Fix flaky test",
          url: "https://github.com/acme/app/pull/42",
          author: "alice",
          branch: "fix/flaky-test",
          draft: false,
          createdAt: "2026-07-01T09:00:00.000Z",
        },
      ]);
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/app/pulls?state=open&per_page=50",
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer ghp_x" }),
        }),
      );
    });

    it("tolerates a minimal pull (no author/branch/createdAt)", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, [{ number: 7, draft: true }]),
      ) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      const prs = await service.listOpen("acme");
      expect(prs).toEqual([{ number: 7, title: "", url: "", draft: true }]);
    });

    it("no github integration on the project → [] (no fetch call)", async () => {
      const fetchImpl = vi.fn();
      const service = build({ integrations: [SLACK_INTEGRATION], fetchImpl: fetchImpl as never });
      expect(await service.listOpen("acme")).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("phase 129 — a company github integration without repo uses the project's gitRemote", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(200, [])) as unknown as typeof fetch;
      const company: Integration = {
        ...GITHUB_INTEGRATION,
        projectId: undefined,
        companyId: "acme-co",
        config: { kind: "github", streams: ["pulls"], username: "octocat" },
      };
      const withRemote = { ...PROJECT, gitRemote: "git@github.com:acme/web.git" };
      const service = build({
        projects: { acme: withRemote },
        integrations: [company],
        fetchImpl,
      });
      await service.listOpen("acme");
      expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain("/repos/acme/web/pulls");
      // No gitRemote → no repo → nothing to show, no fetch.
      const noRemote = vi.fn();
      const bare = build({ integrations: [company], fetchImpl: noRemote as never });
      expect(await bare.listOpen("acme")).toEqual([]);
      expect(noRemote).not.toHaveBeenCalled();
    });

    it("a github integration with no stored token → [] (no fetch call)", async () => {
      const fetchImpl = vi.fn();
      const service = build({ token: null, fetchImpl: fetchImpl as never });
      expect(await service.listOpen("acme")).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("unknown project id → ProjectNotFoundError", async () => {
      const service = build({ projects: {} });
      await expect(service.listOpen("nope")).rejects.toThrow(ProjectNotFoundError);
    });

    it("a rate limit throws", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(403, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.listOpen("acme")).rejects.toThrow("rate limited");
    });

    it("a hard non-ok failure throws", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(500, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.listOpen("acme")).rejects.toThrow("HTTP 500");
    });
  });

  describe("merge", () => {
    it("merges successfully and returns the PR url + sha", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { merged: true, sha: "abc123" }),
      ) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      const result = await service.merge("acme", 42, "squash");
      expect(result).toEqual({
        merged: true,
        url: "https://github.com/acme/app/pull/42",
        sha: "abc123",
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/app/pulls/42/merge",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ merge_method: "squash" }),
        }),
      );
    });

    it("records merge-completed on success", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { merged: true, sha: "abc123" }),
      ) as unknown as typeof fetch;
      const record = vi.fn(async () => {});
      const service = build({ fetchImpl, activity: { record } });

      await service.merge("acme", 42);

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "merge-completed",
          refs: { projectId: "acme", itemId: "pr-42" },
        }),
      );
    });

    it("a merge succeeding with no sha in the response still records the merge", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { merged: true }),
      ) as unknown as typeof fetch;
      const record = vi.fn(async () => {});
      const service = build({ fetchImpl, activity: { record } });

      const result = await service.merge("acme", 42);

      expect(result).toEqual({ merged: true, url: "https://github.com/acme/app/pull/42" });
      expect(record).toHaveBeenCalledOnce();
    });

    it("a 409/422 (not mergeable) records nothing", async () => {
      const record = vi.fn(async () => {});
      const fetchImpl = vi.fn(async () =>
        jsonResponse(409, { message: "Merge conflict" }),
      ) as unknown as typeof fetch;
      const service = build({ fetchImpl, activity: { record } });

      await expect(service.merge("acme", 42)).rejects.toThrow(PrNotMergeableError);
      expect(record).not.toHaveBeenCalled();
    });

    it("a 409 from GitHub (not mergeable) → PrNotMergeableError", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(409, { message: "Merge conflict" }),
      ) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.merge("acme", 42)).rejects.toThrow(PrNotMergeableError);
      await expect(service.merge("acme", 42)).rejects.toThrow(/Merge conflict/);
    });

    it("a 405 from GitHub (not mergeable) → PrNotMergeableError", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(405, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.merge("acme", 42)).rejects.toThrow(PrNotMergeableError);
    });

    it("no github link/token → NoGithubLinkError (no fetch call)", async () => {
      const fetchImpl = vi.fn();
      const service = build({ token: null, fetchImpl: fetchImpl as never });
      await expect(service.merge("acme", 42)).rejects.toThrow(NoGithubLinkError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("unknown project id → ProjectNotFoundError", async () => {
      const service = build({ projects: {} });
      await expect(service.merge("nope", 42)).rejects.toThrow(ProjectNotFoundError);
    });

    it("a hard non-ok failure throws", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(500, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.merge("acme", 42)).rejects.toThrow("HTTP 500");
    });

    it("125e — fires roadmapGate.onMerge on a successful merge", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { merged: true, sha: "abc123" }),
      ) as unknown as typeof fetch;
      const onMerge = vi.fn(async () => {});
      const service = build({ fetchImpl, roadmapGate: { onMerge } });

      await service.merge("acme", 42);

      expect(onMerge).toHaveBeenCalledWith("acme", 42);
    });

    it("125e — a throwing/rejecting roadmapGate.onMerge never fails the merge (Law 3 posture)", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { merged: true, sha: "abc123" }),
      ) as unknown as typeof fetch;
      const onMerge = vi.fn(async () => {
        throw new Error("roadmap bookkeeping exploded");
      });
      const service = build({ fetchImpl, roadmapGate: { onMerge } });

      const result = await service.merge("acme", 42);

      expect(result.merged).toBe(true);
      expect(onMerge).toHaveBeenCalledWith("acme", 42);
    });

    it("125e — a merge with no sha still fires roadmapGate.onMerge (the PR number is enough)", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { merged: true }),
      ) as unknown as typeof fetch;
      const onMerge = vi.fn(async () => {});
      const service = build({ fetchImpl, roadmapGate: { onMerge } });

      await service.merge("acme", 42);

      expect(onMerge).toHaveBeenCalledWith("acme", 42);
    });
  });

  describe("getPr / isMerged (125e)", () => {
    it("getPr maps a merged PR", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { number: 42, merged: true, state: "closed" }),
      ) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.getPr("acme", 42)).resolves.toEqual({
        number: 42,
        merged: true,
        state: "closed",
      });
    });

    it("getPr returns null on 404 (PR/repo gone)", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(404, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.getPr("acme", 42)).resolves.toBeNull();
    });

    it("getPr returns null when there's no github link", async () => {
      const service = build({ token: null });
      await expect(service.getPr("acme", 42)).resolves.toBeNull();
    });

    it("getPr throws on rate limiting (429/403)", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(429, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.getPr("acme", 42)).rejects.toThrow(/rate limited/);
    });

    it("getPr throws on a hard non-2xx failure", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(500, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.getPr("acme", 42)).rejects.toThrow("HTTP 500");
    });

    it("isMerged is true only when getPr reports merged", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { number: 42, merged: true, state: "closed" }),
      ) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.isMerged("acme", 42)).resolves.toBe(true);
    });

    it("isMerged is fail-CLOSED: a getPr rejection (rate limit) resolves to false, never throws", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(429, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.isMerged("acme", 42)).resolves.toBe(false);
    });

    it("isMerged is fail-CLOSED on a 404 too (gone is not merged)", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(404, {})) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      await expect(service.isMerged("acme", 42)).resolves.toBe(false);
    });
  });

  describe("merge with deleteBranch (Phase 129 P3)", () => {
    const route = (opts: { headRepo?: string; deleteStatus?: number }) =>
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/merge")) return jsonResponse(200, { merged: true, sha: "abc" });
        if (url.endsWith("/pulls/42")) {
          return jsonResponse(200, {
            head: { ref: "feat/x", repo: { full_name: opts.headRepo ?? "acme/app" } },
            base: { repo: { full_name: "acme/app" } },
          });
        }
        if (init?.method === "DELETE") return jsonResponse(opts.deleteStatus ?? 204, {});
        throw new Error(`unexpected ${url}`);
      });

    it("deletes the head branch after a successful squash merge", async () => {
      const fetchImpl = route({});
      const service = build({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const result = await service.merge("acme", 42, "squash", true);
      expect(result).toMatchObject({ merged: true, branchDeleted: true });
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/app/git/refs/heads/feat/x",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("a failed delete never fails the merge — it comes back as a note", async () => {
      const service = build({
        fetchImpl: route({ deleteStatus: 403 }) as unknown as typeof fetch,
      });
      const result = await service.merge("acme", 42, "squash", true);
      expect(result.merged).toBe(true);
      expect(result.branchDeleted).toBe(false);
      expect(result.note).toMatch(/HTTP 403/);
    });

    it("skips a fork's branch", async () => {
      const fetchImpl = route({ headRepo: "someone/app" });
      const service = build({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const result = await service.merge("acme", 42, "squash", true);
      expect(result).toMatchObject({ merged: true, branchDeleted: false });
      expect(result.note).toMatch(/fork/);
      expect(fetchImpl.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    });

    it("without deleteBranch nothing is deleted; listeners fire on merge", async () => {
      const fetchImpl = route({});
      const service = build({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const merged: string[] = [];
      service.onPrChanged((repo, n) => merged.push(`${repo}#${n}`));
      const result = await service.merge("acme", 42, "squash");
      expect(result.branchDeleted).toBeUndefined();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(merged).toEqual(["acme/app#42"]);
    });
  });

  describe("close (todo-15)", () => {
    it("PATCHes state=closed and notifies listeners", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { state: "closed", draft: false, html_url: "https://x/pull/42" }),
      );
      const service = build({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const changed: string[] = [];
      service.onPrChanged((repo, n) => changed.push(`${repo}#${n}`));
      const result = await service.close("acme", 42);
      expect(result).toEqual({ url: "https://x/pull/42", state: "closed", draft: false });
      const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.github.com/repos/acme/app/pulls/42");
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(String(init.body))).toEqual({ state: "closed" });
      expect(changed).toEqual(["acme/app#42"]);
    });

    it("records pr-closed on success, nothing on a refusal", async () => {
      const record = vi.fn(async () => {});
      const ok = build({
        fetchImpl: (async () => jsonResponse(200, { state: "closed" })) as unknown as typeof fetch,
        activity: { record },
      });
      await ok.close("acme", 42);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "pr-closed",
          summary: "Closed PR #42 in acme/app without merging",
          refs: { projectId: "acme", itemId: "pr-42" },
        }),
      );
      record.mockClear();
      const refused = build({
        fetchImpl: (async () => jsonResponse(422, {})) as unknown as typeof fetch,
        activity: { record },
      });
      await expect(refused.close("acme", 42)).rejects.toBeInstanceOf(PrUpdateRefusedError);
      expect(record).not.toHaveBeenCalled();
    });

    it("a GitHub 422 is a refusal", async () => {
      const service = build({
        fetchImpl: (async () =>
          jsonResponse(422, { message: "already closed" })) as unknown as typeof fetch,
      });
      await expect(service.close("acme", 42)).rejects.toBeInstanceOf(PrUpdateRefusedError);
    });

    it("without a github link it never calls GitHub", async () => {
      const fetchImpl = vi.fn();
      const service = build({ token: null, fetchImpl: fetchImpl as never });
      await expect(service.close("acme", 42)).rejects.toBeInstanceOf(NoGithubLinkError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("setDraft (todo-15)", () => {
    const route = (opts: { draft: boolean; state?: string; errors?: unknown[] }) =>
      vi.fn(async (url: string) =>
        url.endsWith("/graphql")
          ? jsonResponse(200, opts.errors ? { errors: opts.errors } : { data: {} })
          : jsonResponse(200, {
              node_id: "PR_node",
              state: opts.state ?? "open",
              draft: opts.draft,
              html_url: "https://x/pull/42",
            }),
      );

    it("converts a ready PR to draft through the GraphQL mutation", async () => {
      const fetchImpl = route({ draft: false });
      const service = build({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const result = await service.setDraft("acme", 42, true);
      expect(result).toEqual({ url: "https://x/pull/42", state: "open", draft: true });
      const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.github.com/graphql");
      const body = JSON.parse(String(init.body)) as { query: string; variables: unknown };
      expect(body.query).toContain("convertPullRequestToDraft");
      expect(body.variables).toEqual({ id: "PR_node" });
    });

    it("marks a draft ready for review", async () => {
      const fetchImpl = route({ draft: true });
      const service = build({ fetchImpl: fetchImpl as unknown as typeof fetch });
      await service.setDraft("acme", 42, false);
      const [, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
      expect(String(init.body)).toContain("markPullRequestReadyForReview");
    });

    it("records pr-draft-changed for both directions", async () => {
      const record = vi.fn(async () => {});
      const toDraft = build({
        fetchImpl: route({ draft: false }) as unknown as typeof fetch,
        activity: { record },
      });
      await toDraft.setDraft("acme", 42, true);
      expect(record).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "pr-draft-changed",
          summary: "Converted PR #42 in acme/app to draft",
          refs: { projectId: "acme", itemId: "pr-42" },
        }),
      );
      const toReady = build({
        fetchImpl: route({ draft: true }) as unknown as typeof fetch,
        activity: { record },
      });
      await toReady.setDraft("acme", 42, false);
      expect(record).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "pr-draft-changed",
          summary: "Marked PR #42 in acme/app ready for review",
        }),
      );
    });

    it("records nothing for a no-op or a GraphQL refusal", async () => {
      const record = vi.fn(async () => {});
      const noop = build({
        fetchImpl: route({ draft: true }) as unknown as typeof fetch,
        activity: { record },
      });
      await noop.setDraft("acme", 42, true);
      const failing = build({
        fetchImpl: route({ draft: false, errors: [{ message: "no" }] }) as unknown as typeof fetch,
        activity: { record },
      });
      await expect(failing.setDraft("acme", 42, true)).rejects.toThrow();
      expect(record).not.toHaveBeenCalled();
    });

    it("is a no-op when the PR is already in the requested state", async () => {
      const fetchImpl = route({ draft: true });
      const service = build({ fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(await service.setDraft("acme", 42, true)).toMatchObject({ draft: true });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("refuses a closed PR and surfaces GraphQL errors as a refusal", async () => {
      const closed = build({
        fetchImpl: route({ draft: false, state: "closed" }) as unknown as typeof fetch,
      });
      await expect(closed.setDraft("acme", 42, true)).rejects.toBeInstanceOf(PrUpdateRefusedError);
      const failing = build({
        fetchImpl: route({
          draft: false,
          errors: [{ message: "not allowed" }],
        }) as unknown as typeof fetch,
      });
      await expect(failing.setDraft("acme", 42, true)).rejects.toThrow(/not allowed/);
    });
  });
});
