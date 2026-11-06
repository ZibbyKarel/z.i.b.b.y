import { describe, expect, it } from "vitest";
import { TEAM_SLUG_RE, qualifyTeamSlug, teamSlugMatches } from "./team-slug";

describe("qualifyTeamSlug", () => {
  it("prefixes an unqualified slug with the owner", () => {
    expect(qualifyTeamSlug("devrel-team", "shoptet")).toBe("shoptet/devrel-team");
  });
  it("leaves a qualified slug alone", () => {
    expect(qualifyTeamSlug("shoptet/devrel-team", "acme")).toBe("shoptet/devrel-team");
  });
});

describe("teamSlugMatches", () => {
  it.each(["devrel-team", "Shoptet/DevRel-Team", "@shoptet/devrel-team"])("matches %s", (slug) => {
    expect(teamSlugMatches("shoptet/devrel-team", slug)).toBe(true);
  });
  it("does not match another org or team", () => {
    expect(teamSlugMatches("acme/devrel-team", "shoptet/devrel-team")).toBe(false);
    expect(teamSlugMatches("shoptet/frontend", "devrel-team")).toBe(false);
  });
  it("matches a nested GitLab group path", () => {
    expect(teamSlugMatches("team-blue/shoptet/frontend", "@team-blue/shoptet/frontend")).toBe(true);
    expect(teamSlugMatches("team-blue/shoptet/frontend", "frontend")).toBe(true);
    expect(teamSlugMatches("team-blue/other/frontend", "team-blue/shoptet/frontend")).toBe(false);
  });
});

describe("TEAM_SLUG_RE", () => {
  it.each(["frontend-team", "shoptet/frontend-team", "team-blue/shoptet/frontend"])(
    "accepts %s",
    (s) => {
      expect(TEAM_SLUG_RE.test(s)).toBe(true);
    },
  );
  it.each(["", "a//b", "/a", "a/", "a b"])("rejects %j", (s) => {
    expect(TEAM_SLUG_RE.test(s)).toBe(false);
  });
});
