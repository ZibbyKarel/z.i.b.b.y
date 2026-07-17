import { describe, expect, it } from "vitest";
import { EmptyBodySchema } from "../common.schema";
import { BriefingSchema, briefingContract } from "../index";

describe("briefingContract", () => {
  it("exposes a pure GET and a mutating POST /generate under /api/briefing", () => {
    expect(briefingContract.getBriefing.path).toBe("/api/briefing");
    expect(briefingContract.getBriefing.method).toBe("GET");
    expect(briefingContract.generateBriefing.path).toBe("/api/briefing/generate");
    expect(briefingContract.generateBriefing.method).toBe("POST");
  });

  it("generateBriefing's empty body IS the shared EmptyBodySchema (T11 dedup, finding #37)", () => {
    expect(briefingContract.generateBriefing.body).toBe(EmptyBodySchema);
  });
});

describe("BriefingSchema", () => {
  const base = {
    generatedAt: "2026-06-12T07:00:00.000Z",
    since: "2026-06-11T07:00:00.000Z",
    headline: "Nothing needs you.",
    nothingNeedsYou: true,
    needsYou: [],
    didForYou: [],
    watching: [],
    engagements: [],
    counts: { runsFinished: 0, runsFailed: 0, parked: 0, approvalsPending: 0, channelItemsNew: 0 },
  };

  it("accepts the calm, nothing-needs-you output as first-class", () => {
    expect(BriefingSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a per-engagement rollup (Phase 8.2)", () => {
    const withEngagements = {
      ...base,
      engagements: [
        { projectId: "alpha", name: "Alpha", needsYou: 2, didForYou: 3, queued: 1, held: 1 },
      ],
    };
    expect(BriefingSchema.safeParse(withEngagements).success).toBe(true);
  });

  it("accepts a needs-you item with refs", () => {
    const withItem = {
      ...base,
      nothingNeedsYou: false,
      needsYou: [
        {
          kind: "approval",
          id: "a1",
          summary: "x wants to pay",
          at: "2026-06-12T06:00:00.000Z",
          refs: { approvalId: "a1" },
        },
      ],
    };
    expect(BriefingSchema.safeParse(withItem).success).toBe(true);
  });

  it("rejects an unknown needsYou kind", () => {
    const bad = {
      ...base,
      needsYou: [
        { kind: "whatever", id: "a1", summary: "x", at: "2026-06-12T06:00:00.000Z", refs: {} },
      ],
    };
    expect(BriefingSchema.safeParse(bad).success).toBe(false);
  });

  describe("per-subsystem lines (NS2 F3b — strictly additive)", () => {
    it("accepts a briefing with subsystem lines (note optional)", () => {
      const withSubsystems = {
        ...base,
        subsystems: [
          { subsystem: "forge", name: "Forge", state: "waiting", tier2Count: 0, tier3Count: 2 },
          {
            subsystem: "ledger",
            name: "Ledger",
            state: "idle",
            tier2Count: 0,
            tier3Count: 0,
            note: "62 % týdenního okna",
          },
        ],
      };
      expect(BriefingSchema.safeParse(withSubsystems).success).toBe(true);
    });

    it("omitting subsystems entirely still parses (old briefings)", () => {
      const parsed = BriefingSchema.safeParse(base);
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.subsystems).toBeUndefined();
    });

    it("rejects an unknown subsystem id or state", () => {
      const badId = {
        ...base,
        subsystems: [{ subsystem: "nope", name: "X", state: "idle", tier2Count: 0, tier3Count: 0 }],
      };
      expect(BriefingSchema.safeParse(badId).success).toBe(false);
      const badState = {
        ...base,
        subsystems: [
          { subsystem: "forge", name: "Forge", state: "sleeping", tier2Count: 0, tier3Count: 0 },
        ],
      };
      expect(BriefingSchema.safeParse(badState).success).toBe(false);
    });
  });

  describe("T11 finding #12 — trend7d/learnedPatterns/automationGaps/appIdeas cap at 50 entries", () => {
    it("50 entries passes, 51 rejects (array length only — elements stay unbounded)", () => {
      expect(BriefingSchema.safeParse({ ...base, trend7d: Array(50).fill("x") }).success).toBe(
        true,
      );
      expect(BriefingSchema.safeParse({ ...base, trend7d: Array(51).fill("x") }).success).toBe(
        false,
      );
      expect(
        BriefingSchema.safeParse({ ...base, learnedPatterns: Array(50).fill("x") }).success,
      ).toBe(true);
      expect(
        BriefingSchema.safeParse({ ...base, learnedPatterns: Array(51).fill("x") }).success,
      ).toBe(false);
      expect(
        BriefingSchema.safeParse({ ...base, automationGaps: Array(50).fill("x") }).success,
      ).toBe(true);
      expect(
        BriefingSchema.safeParse({ ...base, automationGaps: Array(51).fill("x") }).success,
      ).toBe(false);
      expect(BriefingSchema.safeParse({ ...base, appIdeas: Array(50).fill("x") }).success).toBe(
        true,
      );
      expect(BriefingSchema.safeParse({ ...base, appIdeas: Array(51).fill("x") }).success).toBe(
        false,
      );
    });
  });
});
