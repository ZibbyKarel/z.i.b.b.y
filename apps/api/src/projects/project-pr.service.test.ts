import type { Integration, Project } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, PrNotMergeableError, ProjectNotFoundError } from "./projects.errors";
import { ProjectPrService } from "./project-pr.service";

const PROJECT: Project = { id: "acme", name: "acme", path: "~/Projects/acme" };

const GITHUB_INTEGRATION: Integration = {
  id: "acme-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"] },
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
    read: async () => (opts.token === undefined ? { token: "ghp_x" } : opts.token ? { token: opts.token } : null),
  };
  return new ProjectPrService(
    projectsStore as never,
    resolvedProjects as never,
    credentials as never,
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
        expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer ghp_x" }) }),
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
    it("merges successfully and returns the PR url", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, { merged: true, sha: "abc123" }),
      ) as unknown as typeof fetch;
      const service = build({ fetchImpl });
      const result = await service.merge("acme", 42, "squash");
      expect(result).toEqual({ merged: true, url: "https://github.com/acme/app/pull/42" });
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/app/pulls/42/merge",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ merge_method: "squash" }),
        }),
      );
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
  });
});
