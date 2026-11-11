import { describe, expect, it } from "vitest";
import { buildReviewers, codeOwnersOf } from "./pr-reviewers";

describe("codeOwnersOf", () => {
  const text = [
    "# comment",
    "*            @acme/everyone",
    "*.ts         @acme/ts",
    "/docs/       @acme/docs",
    "apps/**/api  @acme/api",
    "build/       @solo",
    "/apps/web/*.tsx @acme/web",
  ].join("\n");

  it("last matching rule wins", () => {
    expect(codeOwnersOf(text, "README.md")).toEqual(["@acme/everyone"]);
    expect(codeOwnersOf(text, "src/deep/a.ts")).toEqual(["@acme/ts"]);
  });
  it("anchored directory patterns match only at the root", () => {
    expect(codeOwnersOf(text, "docs/guide/x.md")).toEqual(["@acme/docs"]);
    expect(codeOwnersOf(text, "src/docs/x.md")).toEqual(["@acme/everyone"]);
  });
  it("unanchored directory matches anywhere; ** crosses directories", () => {
    expect(codeOwnersOf(text, "x/build/out.js")).toEqual(["@solo"]);
    expect(codeOwnersOf(text, "apps/one/two/api/main.go")).toEqual(["@acme/api"]);
  });
  it("* does not cross a slash", () => {
    expect(codeOwnersOf(text, "apps/web/a.tsx")).toEqual(["@acme/web"]);
    expect(codeOwnersOf(text, "apps/web/x/a.tsx")).toEqual(["@acme/everyone"]);
  });
  it("a trailing single * does not reach into subdirectories", () => {
    const rules = "*  @acme/all\ndocs/*  @acme/docs";
    expect(codeOwnersOf(rules, "docs/a.md")).toEqual(["@acme/docs"]);
    expect(codeOwnersOf(rules, "docs/a/b.md")).toEqual(["@acme/all"]);
  });
  it("no rules, no owners", () => {
    expect(codeOwnersOf("", "a.ts")).toEqual([]);
  });
});

describe("buildReviewers", () => {
  const base = {
    org: "acme",
    author: "me",
    requestedUsers: [] as string[],
    requestedTeams: [] as { slug: string; name: string }[],
    reviews: [] as Parameters<typeof buildReviewers>[0]["reviews"],
    teamMembers: {} as Record<string, string[]>,
    teamNames: {} as Record<string, string>,
    codeowners: null as string | null,
    files: [] as string[],
  };

  it("nests a reviewer under every listed team they belong to and flags code-owner teams", () => {
    const tree = buildReviewers({
      ...base,
      requestedTeams: [{ slug: "web", name: "Web" }],
      reviews: [
        {
          author: "ann",
          state: "APPROVED",
          onBehalfOf: [{ slug: "api", name: "API" }],
          comments: 0,
        },
      ],
      teamMembers: { web: ["ann", "bob"], api: ["ann"] },
      codeowners: "*.ts @acme/api\n*.md @other/web",
      files: ["src/a.ts"],
    });
    expect(tree.teams).toEqual([
      {
        slug: "web",
        name: "Web",
        codeOwner: false,
        requested: true,
        members: [{ login: "ann", state: "approved", commented: false }],
      },
      {
        slug: "api",
        name: "API",
        codeOwner: true,
        requested: false,
        members: [{ login: "ann", state: "approved", commented: false }],
      },
    ]);
    expect(tree.users).toEqual([]);
  });

  it("latest verdict wins, comments are flagged, a re-request shows pending, author is skipped", () => {
    const tree = buildReviewers({
      ...base,
      requestedUsers: ["cid"],
      reviews: [
        { author: "bob", state: "CHANGES_REQUESTED", onBehalfOf: [], comments: 2 },
        { author: "bob", state: "APPROVED", onBehalfOf: [], comments: 0 },
        { author: "cid", state: "CHANGES_REQUESTED", onBehalfOf: [], comments: 0 },
        { author: "dan", state: "COMMENTED", onBehalfOf: [], comments: 1 },
        { author: "eve", state: "APPROVED", onBehalfOf: [], comments: 0 },
        { author: "eve", state: "DISMISSED", onBehalfOf: [], comments: 0 },
        { author: "me", state: "COMMENTED", onBehalfOf: [], comments: 3 },
        { author: "fay", state: "PENDING", onBehalfOf: [], comments: 1 },
      ],
    });
    expect(tree.users).toEqual([
      { login: "cid", state: "pending", commented: false },
      { login: "bob", state: "approved", commented: true },
      { login: "dan", state: "commented", commented: true },
      { login: "eve", state: "commented", commented: false },
    ]);
  });

  it("matches CODEOWNERS team slugs case-insensitively (GraphQL slugs are lowercase)", () => {
    const tree = buildReviewers({
      ...base,
      requestedTeams: [{ slug: "web", name: "Web" }],
      codeowners: "* @Acme/Web",
      files: ["a.ts"],
    });
    expect(tree.teams.map((t) => [t.slug, t.codeOwner])).toEqual([["web", true]]);
  });

  it("CODEOWNER teams of changed files are listed even when not requested", () => {
    const tree = buildReviewers({
      ...base,
      teamNames: { ops: "Ops" },
      codeowners: "/infra/ @acme/ops @solo",
      files: ["infra/main.tf"],
    });
    expect(tree.teams).toEqual([
      { slug: "ops", name: "Ops", codeOwner: true, requested: false, members: [] },
    ]);
  });
});
