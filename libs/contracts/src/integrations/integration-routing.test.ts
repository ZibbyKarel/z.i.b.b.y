import { describe, expect, it } from "vitest";
import {
  type RoutableProject,
  RoutingMatchSchema,
  matchRouting,
  repoFromGitRemote,
} from "./integration-routing";

describe("RoutingMatchSchema", () => {
  it("requires jql or projectKey for jira", () => {
    expect(RoutingMatchSchema.safeParse({ kind: "jira", labels: ["x"] }).success).toBe(false);
    expect(RoutingMatchSchema.safeParse({ kind: "jira", projectKey: "ABC" }).success).toBe(true);
    expect(RoutingMatchSchema.safeParse({ kind: "jira", jql: "project = A" }).success).toBe(true);
  });
  it("accepts github with no config and slack with >=1 channel", () => {
    expect(RoutingMatchSchema.safeParse({ kind: "github" }).success).toBe(true);
    expect(RoutingMatchSchema.safeParse({ kind: "slack", channels: [] }).success).toBe(false);
    expect(RoutingMatchSchema.safeParse({ kind: "slack", channels: ["C1"] }).success).toBe(true);
  });
});

describe("repoFromGitRemote", () => {
  it.each([
    ["git@github.com:Shoptet/cms4.git", "shoptet/cms4"],
    ["https://github.com/shoptet/partner-cli", "shoptet/partner-cli"],
    ["ssh://git@github.com/a/b.git", "a/b"],
  ])("%s", (remote, repo) => expect(repoFromGitRemote(remote)).toBe(repo));
  it("returns null for absent/odd input", () => {
    expect(repoFromGitRemote(undefined)).toBeNull();
    expect(repoFromGitRemote("https://example.com/only-one")).toBeNull();
  });
});

const projects: RoutableProject[] = [
  {
    id: "cms4",
    gitRemote: "git@github.com:shoptet/cms4.git",
    integrationRouting: [
      { integrationId: "jira1", match: { kind: "jira", projectKey: "CZ", labels: ["portal"] } },
      { integrationId: "gh", match: { kind: "github" } },
      { integrationId: "sl", match: { kind: "slack", channels: ["C1"] } },
    ],
  },
  {
    id: "cli",
    gitRemote: "https://github.com/shoptet/partner-cli",
    integrationRouting: [
      { integrationId: "jira1", match: { kind: "jira", projectKey: "CZ", labels: ["cli"] } },
      { integrationId: "jira1", match: { kind: "jira", jql: "labels = x", projectKey: "ZZ" } },
      { integrationId: "gh", match: { kind: "github" } },
    ],
  },
  { id: "none" },
];

describe("matchRouting", () => {
  const jira = (labels: string[], projectKey = "cz") => ({
    integrationId: "jira1",
    kind: "jira" as const,
    jira: { projectKey, components: [], labels },
  });

  it("matches jira by projectKey + any label (case-insensitive)", () => {
    expect(matchRouting(jira(["Portal"]), projects)).toEqual(["cms4"]);
    expect(matchRouting(jira(["cli"]), projects)).toEqual(["cli"]);
  });
  it("returns every match so the caller can triage ambiguity", () => {
    expect(matchRouting(jira(["portal", "cli"]), projects)).toEqual(["cms4", "cli"]);
  });
  it("jql rules match only via jqlMatches", () => {
    const item = jira([], "zz");
    expect(matchRouting(item, projects)).toEqual([]);
    expect(matchRouting(item, projects, new Set(["cli"]))).toEqual(["cli"]);
  });
  it("ignores other integrations and projects without rules", () => {
    expect(matchRouting({ ...jira(["portal"]), integrationId: "other" }, projects)).toEqual([]);
  });
  it("matches github through the project's gitRemote", () => {
    const item = { integrationId: "gh", kind: "github" as const, github: { repo: "Shoptet/CMS4" } };
    expect(matchRouting(item, projects)).toEqual(["cms4"]);
  });
  it("matches slack by channel", () => {
    const item = { integrationId: "sl", kind: "slack" as const, slack: { channel: "C1" } };
    expect(matchRouting(item, projects)).toEqual(["cms4"]);
    expect(matchRouting({ ...item, slack: { channel: "C2" } }, projects)).toEqual([]);
  });
});
