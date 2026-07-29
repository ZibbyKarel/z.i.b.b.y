import { describe, expect, it } from "vitest";
import { ZibbyPrLocator, prNumberFromUrl } from "./zibby-pr.locator";

function makeLocator(
  artifacts: Array<{ kind: string; locator: string; projectId: string }>,
  tasks: Array<{ projectId?: string; outcome?: { pr?: { url: string } } }>,
) {
  return new ZibbyPrLocator(
    {
      listFiltered: async (query: { projectId?: string }) =>
        artifacts.filter((artifact) => artifact.projectId === query.projectId),
    } as never,
    { list: async () => tasks } as never,
  );
}

describe("prNumberFromUrl", () => {
  it("reads the number out of a PR url", () => {
    expect(prNumberFromUrl("https://github.com/acme/app/pull/42")).toBe(42);
  });

  it("returns null for anything else", () => {
    expect(prNumberFromUrl("https://github.com/acme/app/issues/42")).toBeNull();
    expect(prNumberFromUrl("nonsense")).toBeNull();
  });
});

describe("ZibbyPrLocator", () => {
  it("unions pr artifacts and task outcomes, newest first, deduped", async () => {
    const locator = makeLocator(
      [
        { kind: "pr", locator: "https://github.com/acme/app/pull/7", projectId: "acme" },
        // Same-project artifact with a URL that would ALSO parse as PR #999 if it were
        // counted — the only reason it must be excluded is `kind !== "pr"`, not the URL.
        { kind: "vault-note", locator: "https://github.com/acme/app/pull/999", projectId: "acme" },
        { kind: "pr", locator: "https://github.com/acme/app/pull/9", projectId: "acme" },
      ],
      [
        { projectId: "acme", outcome: { pr: { url: "https://github.com/acme/app/pull/9" } } },
        { projectId: "acme", outcome: { pr: { url: "https://github.com/acme/app/pull/11" } } },
        { projectId: "other", outcome: { pr: { url: "https://github.com/x/y/pull/99" } } },
        { projectId: "acme" },
      ],
    );

    expect(await locator.numbersFor("acme")).toEqual([11, 9, 7]);
  });

  it("returns an empty list when the project produced no PR", async () => {
    expect(await makeLocator([], []).numbersFor("acme")).toEqual([]);
  });

  it("scopes the artifact lookup to the requested project", async () => {
    let receivedQuery: unknown;
    const locator = new ZibbyPrLocator(
      {
        listFiltered: async (query: unknown) => {
          receivedQuery = query;
          return [];
        },
      } as never,
      { list: async () => [] } as never,
    );

    await locator.numbersFor("acme");

    expect(receivedQuery).toEqual({ projectId: "acme" });
  });
});
