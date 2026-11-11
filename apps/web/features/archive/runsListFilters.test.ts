import { describe, expect, it } from "vitest";
import {
  EMPTY_RUNS_LIST_FILTERS,
  nextSort,
  parseRunsListFilters,
  statusesForState,
  writeRunsListFilters,
} from "./runsListFilters";

describe("runsListFilters (todo-14)", () => {
  it("round-trips every filter through the URL and omits defaults", () => {
    const filters = {
      ...EMPTY_RUNS_LIST_FILTERS,
      q: "deploy",
      state: "running" as const,
      project: "p1",
      kind: "workflow" as const,
      sort: "cost" as const,
      dir: "asc" as const,
    };
    const params = writeRunsListFilters(new URLSearchParams("pr=keep"), filters);
    expect(params.get("pr")).toBe("keep");
    expect(params.has("department")).toBe(false);
    expect(parseRunsListFilters(params)).toEqual(filters);
    expect(writeRunsListFilters(params, EMPTY_RUNS_LIST_FILTERS).toString()).toBe("pr=keep");
  });

  it("drops unknown state/kind/sort/dir values", () => {
    const f = parseRunsListFilters(new URLSearchParams("state=x&kind=y&sort=z&dir=up"));
    expect(f).toEqual(EMPTY_RUNS_LIST_FILTERS);
  });

  it("nextSort flips the active column and starts a new one desc (title asc)", () => {
    expect(nextSort({ sort: "", dir: "" }, "started")).toEqual({ sort: "started", dir: "asc" });
    expect(nextSort({ sort: "started", dir: "asc" }, "started")).toEqual({ sort: "", dir: "" });
    expect(nextSort({ sort: "", dir: "" }, "cost")).toEqual({ sort: "cost", dir: "desc" });
    expect(nextSort({ sort: "cost", dir: "desc" }, "cost")).toEqual({ sort: "cost", dir: "asc" });
    expect(nextSort({ sort: "cost", dir: "desc" }, "title")).toEqual({ sort: "title", dir: "asc" });
  });

  it("statusesForState: a group's statuses, every status for all", () => {
    expect(statusesForState("running")).toEqual(["running"]);
    expect(statusesForState("")).toContain("awaiting-approval");
    expect(statusesForState("")).toContain("done");
  });
});
