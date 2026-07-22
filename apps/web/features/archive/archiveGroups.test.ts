import { describe, expect, it } from "vitest";
import type { RunView } from "../runs/run";
import type { OwnerSubsystemMaps } from "../subsystems/useOwnerSubsystem";
import {
  NO_SUBSYSTEM,
  archiveSubsystemFilterId,
  computeSubsystemCounts,
  filterArchiveRuns,
  groupArchiveRuns,
  groupBySubsystem,
  groupByTime,
  matchesArchiveSearch,
  timeBucket,
} from "./archiveGroups";

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "done",
    pct: null,
    title: "",
    prompt: "",
    project: "",
    startedAt: new Date().toISOString(),
    logBase: "agents",
    ...overrides,
  };
}

function maps(overrides: Partial<OwnerSubsystemMaps> = {}): OwnerSubsystemMaps {
  return { pipelineSubsystem: new Map(), ...overrides };
}

describe("matchesArchiveSearch", () => {
  it("matches on title (case-insensitive)", () => {
    expect(matchesArchiveSearch(run({ title: "Fix login bug" }), "LOGIN")).toBe(true);
    expect(matchesArchiveSearch(run({ title: "Fix login bug" }), "billing")).toBe(false);
  });

  it("matches on project", () => {
    expect(matchesArchiveSearch(run({ project: "billing-svc" }), "billing")).toBe(true);
  });

  it("matches everything when the query is empty or blank", () => {
    expect(matchesArchiveSearch(run(), "")).toBe(true);
    expect(matchesArchiveSearch(run(), "   ")).toBe(true);
  });
});

describe("archiveSubsystemFilterId / D8 join", () => {
  it("returns NO_SUBSYSTEM for an agent run — no subsystem concept applies at all", () => {
    const id = archiveSubsystemFilterId(run({ kind: "agent", owner: "writer" }), maps());
    expect(id).toBe(NO_SUBSYSTEM);
  });

  it("returns NO_SUBSYSTEM for a goal run", () => {
    const id = archiveSubsystemFilterId(run({ kind: "goal", owner: "g1" }), maps());
    expect(id).toBe(NO_SUBSYSTEM);
  });

  it("returns the tagged subsystem for a pipeline run", () => {
    const id = archiveSubsystemFilterId(
      run({ kind: "pipeline", owner: "delivery" }),
      maps({ pipelineSubsystem: new Map([["delivery", "forge"]]) }),
    );
    expect(id).toBe("forge");
  });

  it("returns NO_SUBSYSTEM for an untagged pipeline owner", () => {
    const id = archiveSubsystemFilterId(run({ kind: "pipeline", owner: "untagged" }), maps());
    expect(id).toBe(NO_SUBSYSTEM);
  });
});

describe("filterArchiveRuns (D9 archive split + search + subsystem filter)", () => {
  it("excludes every non-archived status, including paused-limit", () => {
    const runs = [
      run({ runId: "a", status: "done" }),
      run({ runId: "b", status: "error" }),
      run({ runId: "c", status: "interrupted" }),
      run({ runId: "d", status: "parked" }),
      run({ runId: "e", status: "running" }),
      run({ runId: "f", status: "paused-limit" }),
      run({ runId: "g", status: "scheduled" }),
    ];
    const filtered = filterArchiveRuns(runs, "", [], maps());
    expect(filtered.map((r) => r.runId)).toEqual(["a", "b", "c", "d"]);
  });

  it("applies the search query on top of the archive split", () => {
    const runs = [
      run({ runId: "a", title: "Fix login bug", status: "done" }),
      run({ runId: "b", title: "Draft release notes", status: "done" }),
    ];
    expect(filterArchiveRuns(runs, "login", [], maps()).map((r) => r.runId)).toEqual(["a"]);
  });

  it("applies the subsystem filter — empty selection means all subsystems", () => {
    const m = maps({
      pipelineSubsystem: new Map([
        ["delivery", "forge"],
        ["watch", "loom"],
      ]),
    });
    const runs = [
      run({ runId: "a", kind: "pipeline", owner: "delivery", status: "done" }),
      run({ runId: "b", kind: "pipeline", owner: "watch", status: "done" }),
      run({ runId: "c", kind: "agent", owner: "writer", status: "done" }),
    ];
    expect(filterArchiveRuns(runs, "", [], m).map((r) => r.runId)).toEqual(["a", "b", "c"]);
    expect(filterArchiveRuns(runs, "", ["forge"], m).map((r) => r.runId)).toEqual(["a"]);
    expect(filterArchiveRuns(runs, "", [NO_SUBSYSTEM], m).map((r) => r.runId)).toEqual(["c"]);
    expect(filterArchiveRuns(runs, "", ["forge", NO_SUBSYSTEM], m).map((r) => r.runId)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("computeSubsystemCounts", () => {
  it("counts archived + search-matched rows per subsystem id, unaffected by the subsystem selection itself", () => {
    const m = maps({ pipelineSubsystem: new Map([["delivery", "forge"]]) });
    const runs = [
      run({ runId: "a", kind: "pipeline", owner: "delivery", status: "done" }),
      run({ runId: "b", kind: "pipeline", owner: "delivery", status: "done" }),
      run({ runId: "c", kind: "agent", owner: "writer", status: "done" }),
      run({ runId: "d", kind: "agent", owner: "writer", status: "running" }), // not archived
    ];
    expect(computeSubsystemCounts(runs, "", m)).toEqual({ forge: 2, [NO_SUBSYSTEM]: 1 });
  });
});

describe("groupBySubsystem", () => {
  it("groups by SUBSYSTEMS registry order, then NO_SUBSYSTEM last, dropping empty groups", () => {
    const m = maps({
      pipelineSubsystem: new Map([
        ["delivery", "loom"],
        ["release", "forge"],
      ]),
    });
    const runs = [
      run({ runId: "a", kind: "pipeline", owner: "delivery" }),
      run({ runId: "b", kind: "pipeline", owner: "release" }),
      run({ runId: "c", kind: "agent", owner: "writer" }),
    ];
    const groups = groupBySubsystem(runs, m);
    // forge sorts before loom in the SUBSYSTEMS registry order.
    expect(groups.map((g) => g.id)).toEqual(["forge", "loom", NO_SUBSYSTEM]);
    expect(groups[0]?.color).toMatch(/^#/);
    expect(groups.find((g) => g.id === NO_SUBSYSTEM)?.color).toBeUndefined();
    expect(groups.find((g) => g.id === NO_SUBSYSTEM)?.items.map((r) => r.runId)).toEqual(["c"]);
  });

  it("never hides agent/goal runs — they land in the explicit NO_SUBSYSTEM group", () => {
    const runs = [run({ runId: "a", kind: "agent", owner: "writer" })];
    const groups = groupBySubsystem(runs, maps());
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: NO_SUBSYSTEM, items: [{ runId: "a" }] });
  });
});

describe("timeBucket / groupByTime", () => {
  // `timeBucket` derives "today"'s boundary via `setHours(0, 0, 0, 0)` — the
  // JS runtime's LOCAL calendar day (the right definition: "today" means the
  // operator's own wall-clock day, not a UTC day). Fixtures below are built
  // with the local-time `Date` constructor (not UTC ISO literals) so the
  // suite passes under any machine timezone, not just UTC.
  const now = new Date(2026, 6, 19, 12, 0, 0).getTime();

  it("classifies today/yesterday/week/older correctly", () => {
    expect(timeBucket(new Date(2026, 6, 19, 1, 0, 0).toISOString(), now)).toBe("today");
    expect(timeBucket(new Date(2026, 6, 18, 23, 0, 0).toISOString(), now)).toBe("yesterday");
    expect(timeBucket(new Date(2026, 6, 14, 12, 0, 0).toISOString(), now)).toBe("week");
    expect(timeBucket(new Date(2026, 5, 1, 12, 0, 0).toISOString(), now)).toBe("older");
  });

  it("groups by bucket in AR_GROUP_ORDER, dropping empty buckets", () => {
    const runs = [
      run({ runId: "a", startedAt: new Date(2026, 6, 19, 1, 0, 0).toISOString() }),
      run({ runId: "b", startedAt: new Date(2026, 5, 1, 12, 0, 0).toISOString() }),
    ];
    const groups = groupByTime(runs, now);
    expect(groups.map((g) => g.id)).toEqual(["today", "older"]);
  });
});

describe("groupArchiveRuns dispatch", () => {
  it("routes to groupBySubsystem for mode 'subsystem'", () => {
    const runs = [run({ runId: "a", kind: "agent", owner: "writer" })];
    expect(groupArchiveRuns("subsystem", runs, maps(), Date.now())).toEqual(
      groupBySubsystem(runs, maps()),
    );
  });

  it("routes to groupByTime for mode 'time'", () => {
    const now = Date.now();
    const runs = [run({ runId: "a" })];
    expect(groupArchiveRuns("time", runs, maps(), now)).toEqual(groupByTime(runs, now));
  });
});
