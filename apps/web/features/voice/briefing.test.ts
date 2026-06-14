import { describe, expect, it } from "vitest";
import { pickNewlyFinished, summarizeBriefing } from "./briefing";

describe("summarizeBriefing", () => {
  it("counts running agents, pending approvals and recent outcomes", () => {
    const facts = summarizeBriefing({
      approvals: [{ skill: "Kodér" }, { skill: "Architekt" }],
      liveRuns: [{ runId: "r1" }],
      recent: [
        { runId: "r1", owner: "Kodér", status: "running" },
        { runId: "r2", owner: "Tester", status: "done" },
        { runId: "r3", owner: "Review", status: "error" },
        { runId: "r4", owner: "Doku", status: "done" },
      ],
    });
    expect(facts.agents).toBe(1);
    expect(facts.approvals).toBe(2);
    expect(facts.topApprovalSkill).toBe("Kodér");
    expect(facts.done).toBe(2);
    expect(facts.failed).toBe(1);
    expect(facts.quiet).toBe(false);
  });

  it("is quiet when nothing is running, pending or finished", () => {
    const facts = summarizeBriefing({
      approvals: [],
      liveRuns: [],
      recent: [{ runId: "r1", owner: "Kodér", status: "running" }],
    });
    expect(facts.quiet).toBe(true);
    expect(facts.topApprovalSkill).toBeUndefined();
  });
});

describe("pickNewlyFinished", () => {
  const recent = [
    { runId: "r1", owner: "Kodér", status: "running" as const },
    { runId: "r2", owner: "Tester", status: "done" as const },
    { runId: "r3", owner: "Review", status: "error" as const },
  ];

  it("returns terminal runs not yet announced", () => {
    const fresh = pickNewlyFinished(new Set(["r2"]), recent);
    expect(fresh).toEqual([{ runId: "r3", owner: "Review", status: "error" }]);
  });

  it("ignores running runs and already-announced ones", () => {
    expect(pickNewlyFinished(new Set(["r2", "r3"]), recent)).toEqual([]);
  });

  it("returns all terminal runs when none announced", () => {
    expect(pickNewlyFinished(new Set(), recent).map((r) => r.runId)).toEqual([
      "r2",
      "r3",
    ]);
  });
});
