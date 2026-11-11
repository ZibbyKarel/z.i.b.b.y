import { describe, expect, it, vi } from "vitest";
import { CodeOwnersService } from "./code-owners.service";

type Routes = Record<string, { status: number; body: unknown }>;

function fakeFetch(routes: Routes) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const hit = routes[url.pathname + url.search] ?? routes[url.pathname];
    if (!hit) return new Response("not found", { status: 404 });
    const text = typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body);
    return new Response(text, { status: hit.status });
  });
}

const me: Routes = {
  "/user": { status: 200, body: { login: "karel" } },
  "/user/teams": {
    status: 200,
    body: [{ slug: "web", organization: { login: "org" } }],
  },
};
const files = ["apps/web/a.ts", "apps/api/b.ts", "README.md"].map((filename) => ({ filename }));
const CODEOWNERS = "* @org/core\n/apps/web/ @org/web\n/README.md @karel\n";

describe("CodeOwnersService.reviewScope", () => {
  it("no CODEOWNERS in the repo → review everything", async () => {
    const svc = new CodeOwnersService(fakeFetch(me));
    const scope = await svc.reviewScope("org/repo", "main", "t", files);
    expect(scope).toEqual({ kind: "all", reason: "no CODEOWNERS in org/repo@main" });
  });

  it("keeps only the files owned by my teams or by me (last rule wins), from the base ref", async () => {
    const fetchImpl = fakeFetch({
      ...me,
      "/repos/org/repo/contents/.github/CODEOWNERS?ref=main": { status: 200, body: CODEOWNERS },
    });
    const svc = new CodeOwnersService(fetchImpl);
    const scope = await svc.reviewScope("org/repo", "main", "t", files);
    expect(scope).toEqual({
      kind: "mine",
      files: ["apps/web/a.ts", "README.md"],
      outOfScope: 1,
      owners: ["@org/web", "@karel"],
      source: ".github/CODEOWNERS@main",
    });
  });

  it("falls through .github/CODEOWNERS → CODEOWNERS → docs/CODEOWNERS", async () => {
    const svc = new CodeOwnersService(
      fakeFetch({
        ...me,
        "/repos/org/repo/contents/docs/CODEOWNERS?ref=main": { status: 200, body: "* @org/web" },
      }),
    );
    const scope = await svc.reviewScope("org/repo", "main", "t", files);
    expect(scope).toEqual({ kind: "all", reason: "every changed file is owned by your teams" });
  });

  it("none of the files are mine → none", async () => {
    const svc = new CodeOwnersService(
      fakeFetch({
        ...me,
        "/repos/org/repo/contents/CODEOWNERS?ref=main": { status: 200, body: "* @org/core" },
      }),
    );
    expect(await svc.reviewScope("org/repo", "main", "t", files)).toEqual({
      kind: "none",
      files: 3,
      source: "CODEOWNERS@main",
    });
  });

  it("fails open when the team lookup is refused (token without read:org)", async () => {
    const svc = new CodeOwnersService(
      fakeFetch({
        "/user": { status: 200, body: { login: "karel" } },
        "/user/teams": { status: 403, body: {} },
        "/repos/org/repo/contents/CODEOWNERS?ref=main": { status: 200, body: "* @org/core" },
      }),
    );
    const scope = await svc.reviewScope("org/repo", "main", "t", files);
    expect(scope.kind).toBe("all");
    expect(scope).toMatchObject({ reason: expect.stringContaining("/user/teams: HTTP 403") });
  });

  it("SAML SSO: no visible team in the repo's org while CODEOWNERS names its teams → review everything", async () => {
    const svc = new CodeOwnersService(
      fakeFetch({
        "/user": { status: 200, body: { login: "karel" } },
        "/user/teams": { status: 200, body: [{ slug: "x", organization: { login: "other" } }] },
        "/repos/org/repo/contents/CODEOWNERS?ref=main": { status: 200, body: "* @org/core" },
      }),
    );
    expect(await svc.reviewScope("org/repo", "main", "t", files)).toEqual({
      kind: "all",
      reason: "no team membership visible in org",
    });
  });

  it("a renamed file is mine when either its old or its new path is mine", async () => {
    const svc = new CodeOwnersService(
      fakeFetch({
        ...me,
        "/repos/org/repo/contents/CODEOWNERS?ref=main": {
          status: 200,
          body: "* @org/core\n/apps/web/ @org/web\n",
        },
      }),
    );
    const scope = await svc.reviewScope("org/repo", "main", "t", [
      { filename: "libs/moved.ts", previousFilename: "apps/web/moved.ts" },
      { filename: "libs/other.ts" },
    ]);
    expect(scope).toMatchObject({ kind: "mine", files: ["libs/moved.ts"] });
  });

  it("caches the identity per token and CODEOWNERS per repo@ref", async () => {
    const fetchImpl = fakeFetch({
      ...me,
      "/repos/org/repo/contents/.github/CODEOWNERS?ref=main": { status: 200, body: CODEOWNERS },
    });
    const svc = new CodeOwnersService(fetchImpl);
    await svc.reviewScope("org/repo", "main", "t", files);
    const calls = fetchImpl.mock.calls.length;
    await svc.reviewScope("org/repo", "main", "t", files);
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });
});
