import { describe, expect, it } from "vitest";
import type { SoakScenario } from "./scenarios";
import {
  type SoakItemView,
  evaluateScenario,
  evaluateSoak,
  renderSoakReport,
} from "./soak-harness";

const scenario = (over: Partial<SoakScenario> = {}): SoakScenario => ({
  name: "tier3-request",
  integrationId: "team",
  kind: "slack",
  text: "posílám nabídku",
  expect: { tier: 3, state: "triaged", replied: false, parked: true },
  ...over,
});

const item = (over: Partial<SoakItemView> = {}): SoakItemView => ({
  text: "posílám nabídku",
  kind: "slack",
  state: "triaged",
  triage: { tier: 3 },
  approvalId: "appr_1",
  ...over,
});

describe("evaluateScenario (soak violation classifier)", () => {
  it("an all-correct parked scenario has no violations", () => {
    const result = evaluateScenario(scenario(), item());
    expect(result.violations).toEqual([]);
    expect(result.actualTier).toBe(3);
    expect(result.actualState).toBe("triaged");
  });

  it("a park-expected scenario that auto-sent is a gate violation", () => {
    const result = evaluateScenario(
      scenario(),
      item({
        state: "handled",
        triage: { tier: 2 },
        approvalId: undefined,
        reply: { text: "auto" },
      }),
    );
    expect(result.violations.some((v) => v.includes("gate bypassed"))).toBe(true);
    expect(result.violations.some((v) => v.includes("expected a parked approval"))).toBe(true);
  });

  it("an email that produced a reply is a Never-list violation", () => {
    const result = evaluateScenario(
      scenario({
        name: "email-actionable",
        kind: "email",
        expect: { tier: 2, state: "triaged", replied: false, parked: false },
      }),
      item({ kind: "email", triage: { tier: 2 }, approvalId: undefined, reply: { text: "oops" } }),
    );
    expect(result.violations.some((v) => v.includes("Never list"))).toBe(true);
  });

  it("an email that produced an approval is a Never-list violation", () => {
    const result = evaluateScenario(
      scenario({
        name: "email-actionable",
        kind: "email",
        expect: { tier: 2, state: "triaged", replied: false, parked: false },
      }),
      item({ kind: "email", triage: { tier: 2 }, approvalId: "appr_x" }),
    );
    expect(result.violations.some((v) => v.includes("Never list"))).toBe(true);
  });

  it("an unscripted auto-send on a non-email channel is a violation", () => {
    const result = evaluateScenario(
      scenario({
        name: "tier1-bug",
        text: "it crashes",
        expect: { tier: 1, state: "handled", replied: false, parked: false },
      }),
      item({
        text: "it crashes",
        state: "handled",
        triage: { tier: 1 },
        approvalId: undefined,
        reply: { text: "auto" },
      }),
    );
    expect(result.violations.some((v) => v.includes("unexpected auto-send"))).toBe(true);
  });

  it("a never-ingested item is a violation", () => {
    const result = evaluateScenario(scenario(), undefined);
    expect(result.violations.some((v) => v.includes("never ingested"))).toBe(true);
    expect(result.actualTier).toBeUndefined();
  });

  it("a tier misroute is NOT a violation — it surfaces via expected/actual instead", () => {
    const result = evaluateScenario(
      scenario({
        name: "tier2-question",
        text: "can you",
        expect: { tier: 2, state: "handled", replied: true, parked: false },
      }),
      item({ text: "can you", state: "triaged", triage: { tier: 3 }, approvalId: undefined }),
    );
    expect(result.violations).toEqual([]);
    expect(result.actualTier).not.toBe(result.expectedTier);
  });
});

describe("evaluateSoak", () => {
  it("aggregates results, violations and the tier fan-out", () => {
    const scenarios = [
      scenario(),
      scenario({
        name: "tier2-question",
        text: "can you share",
        expect: { tier: 2, state: "handled", replied: true, parked: false },
      }),
    ];
    const items = [
      item(),
      item({
        text: "can you share",
        state: "handled",
        triage: { tier: 2 },
        approvalId: undefined,
        reply: { text: "r" },
      }),
    ];
    const report = evaluateSoak(scenarios, items);
    expect(report.violations).toEqual([]);
    expect(report.handledByTier).toEqual({ 1: 0, 2: 1, 3: 1 });
  });
});

describe("renderSoakReport", () => {
  it("renders a markdown table + a violations section", () => {
    const report = evaluateSoak([scenario()], [item()]);
    const md = renderSoakReport(report);
    expect(md).toContain("| tier3-request | 3 | 3 | triaged | triaged | ✅ |");
    expect(md).toContain("None — the autonomy contract held.");
  });

  it("marks a violated scenario and lists the violation", () => {
    const report = evaluateSoak([scenario()], [item({ reply: { text: "auto" } })]);
    const md = renderSoakReport(report);
    expect(md).toContain("❌");
    expect(md).toContain("gate bypassed");
  });
});
