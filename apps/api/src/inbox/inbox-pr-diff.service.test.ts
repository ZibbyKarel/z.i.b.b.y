import type { Integration, Project } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { InboxPrDiffService, MAX_DIFF_BYTES } from "./inbox-pr-diff.service";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/acme" };
const GITHUB = {
  id: "gh",
  config: { kind: "github", repo: "acme/app", username: "me" },
} as unknown as Integration;

describe("InboxPrDiffService", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let integrations: Integration[];
  let service: InboxPrDiffService;

  beforeEach(() => {
    integrations = [GITHUB];
    fetchImpl = vi.fn(async () => new Response("diff --git a/x b/x\n+x\n"));
    service = new InboxPrDiffService(
      {
        get: async (id: string) => {
          if (id !== PROJECT.id) throw new ProjectNotFoundError(id);
          return PROJECT;
        },
      } as never,
      { resolveIntegrations: async () => integrations } as never,
      { read: async () => ({ token: "tok" }) } as never,
      fetchImpl as unknown as typeof fetch,
    );
  });

  it("fetches the diff from GitHub with the diff media type", async () => {
    expect(await service.getDiff("acme", 7)).toEqual({
      diff: "diff --git a/x b/x\n+x\n",
      truncated: false,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://api.github.com/repos/acme/app/pulls/7");
    expect(init.headers).toMatchObject({
      accept: "application/vnd.github.diff",
      authorization: "Bearer tok",
    });
  });

  it("maps GitHub 406 (diff too large) to an empty truncated diff", async () => {
    fetchImpl.mockResolvedValue(new Response("", { status: 406 }));
    expect(await service.getDiff("acme", 7)).toEqual({ diff: "", truncated: true });
  });

  it("caps an oversized diff at a file boundary", async () => {
    let body = "";
    for (let i = 0; body.length <= MAX_DIFF_BYTES + 1000; i++) {
      body += `diff --git a/f${i} b/f${i}\n+line\n`;
    }
    fetchImpl.mockResolvedValue(new Response(body));
    const { diff, truncated } = await service.getDiff("acme", 7);
    expect(truncated).toBe(true);
    expect(diff.length).toBeLessThanOrEqual(MAX_DIFF_BYTES);
    expect(body.startsWith(diff)).toBe(true);
    expect(body.slice(diff.length).startsWith("diff --git")).toBe(true);
  });

  it.each([404, 500])("throws on GitHub %i", async (status) => {
    fetchImpl.mockResolvedValue(new Response("", { status }));
    await expect(service.getDiff("acme", 7)).rejects.toThrow(String(status));
  });

  it("rejects with NoGithubLinkError without a GitHub link", async () => {
    integrations = [];
    await expect(service.getDiff("acme", 7)).rejects.toBeInstanceOf(NoGithubLinkError);
  });

  it("propagates ProjectNotFoundError", async () => {
    await expect(service.getDiff("nope", 7)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
