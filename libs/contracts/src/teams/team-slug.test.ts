import { describe, expect, it } from "vitest";
import { qualifyTeamSlug, teamSlugMatches } from "./team-slug";

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
});
