import type { TaskRun } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { departmentSpendToday, totalSpendToday } from "./departmentSpend";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function run(over: Partial<TaskRun>): TaskRun {
  return {
    runId: "r1",
    kind: "agent",
    owner: "coder",
    status: "done",
    pct: 100,
    title: "",
    prompt: "",
    project: "",
    startedAt: "2026-09-25T09:00:00.000Z",
    logBase: "agents",
    ...over,
  };
}

describe("departmentSpendToday", () => {
  it("sums runs + costUsd per department, today only", () => {
    const runs: TaskRun[] = [
      run({ runId: "a", department: "dev", costUsd: 1.5 }),
      run({ runId: "b", department: "dev", costUsd: 2.5 }),
      run({ runId: "c", department: "sec", costUsd: 4 }),
    ];
    const byDept = departmentSpendToday(runs, NOW);
    expect(byDept.get("dev")).toEqual({ runs: 2, spendUsd: 4 });
    expect(byDept.get("sec")).toEqual({ runs: 1, spendUsd: 4 });
  });

  it("excludes runs from a different day", () => {
    const runs: TaskRun[] = [
      run({ department: "dev", startedAt: "2026-09-24T09:00:00.000Z", costUsd: 9 }),
    ];
    expect(departmentSpendToday(runs, NOW).size).toBe(0);
  });

  it("excludes runs with no department stamp", () => {
    const runs: TaskRun[] = [run({ department: undefined, costUsd: 9 })];
    expect(departmentSpendToday(runs, NOW).size).toBe(0);
  });

  it("treats an absent costUsd as zero spend, still counting the run", () => {
    const runs: TaskRun[] = [run({ department: "qa", costUsd: undefined })];
    expect(departmentSpendToday(runs, NOW).get("qa")).toEqual({ runs: 1, spendUsd: 0 });
  });

  it("returns an empty map for no runs", () => {
    expect(departmentSpendToday([], NOW).size).toBe(0);
  });
});

describe("totalSpendToday", () => {
  it("sums costUsd across every run today, department or not", () => {
    const runs: TaskRun[] = [
      run({ department: "dev", costUsd: 1 }),
      run({ department: undefined, costUsd: 2 }),
    ];
    expect(totalSpendToday(runs, NOW)).toBe(3);
  });

  it("excludes runs from a different day", () => {
    const runs: TaskRun[] = [run({ startedAt: "2026-09-24T09:00:00.000Z", costUsd: 9 })];
    expect(totalSpendToday(runs, NOW)).toBe(0);
  });
});
