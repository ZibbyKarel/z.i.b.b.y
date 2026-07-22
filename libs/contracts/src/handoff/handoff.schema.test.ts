import { describe, expect, it } from "vitest";
import {
  HANDOFF_SEVERITY_ORDER,
  HandoffOutcomeSchema,
  HandoffProposalSchema,
  HandoffRuleSchema,
  HandoffSignalSchema,
  HandoffTargetSchema,
} from "./handoff.schema";

const SIGNAL = {
  from: "sentinel",
  kind: "cve",
  severity: "critical",
  projectId: "acme",
  title: "Critical CVE in lodash",
  body: "CVE-2026-1234 affects lodash@4.17.20, upgrade to 4.17.21",
  fingerprint: "cve:acme:CVE-2026-1234",
} as const;

const RULE = {
  id: "sentinel-cve-critical",
  from: "sentinel",
  signalKind: "cve",
  minSeverity: "critical",
  to: { kind: "subsystem", id: "forge" },
  tier: 2,
  enabled: true,
  system: true,
} as const;

describe("HandoffSeveritySchema / HANDOFF_SEVERITY_ORDER", () => {
  it("orders the ladder low < moderate < high < critical", () => {
    expect(HANDOFF_SEVERITY_ORDER).toEqual(["low", "moderate", "high", "critical"]);
    expect(HANDOFF_SEVERITY_ORDER.indexOf("low")).toBeLessThan(
      HANDOFF_SEVERITY_ORDER.indexOf("moderate"),
    );
    expect(HANDOFF_SEVERITY_ORDER.indexOf("moderate")).toBeLessThan(
      HANDOFF_SEVERITY_ORDER.indexOf("high"),
    );
    expect(HANDOFF_SEVERITY_ORDER.indexOf("high")).toBeLessThan(
      HANDOFF_SEVERITY_ORDER.indexOf("critical"),
    );
  });
});

describe("HandoffTargetSchema", () => {
  it("parses a minimal subsystem target ({kind, id} only, no display fields)", () => {
    expect(HandoffTargetSchema.parse({ kind: "subsystem", id: "forge" })).toEqual({
      kind: "subsystem",
      id: "forge",
    });
  });

  it("parses a minimal pipeline target", () => {
    expect(HandoffTargetSchema.parse({ kind: "pipeline", id: "delivery" })).toEqual({
      kind: "pipeline",
      id: "delivery",
    });
  });

  it("rejects a bogus kind", () => {
    expect(HandoffTargetSchema.safeParse({ kind: "agent", id: "forge" }).success).toBe(false);
    expect(HandoffTargetSchema.safeParse({ kind: "bogus", id: "forge" }).success).toBe(false);
  });

  it("rejects a subsystem target with an id outside SubsystemIdSchema", () => {
    expect(
      HandoffTargetSchema.safeParse({ kind: "subsystem", id: "not-a-subsystem" }).success,
    ).toBe(false);
  });
});

describe("HandoffSignalSchema", () => {
  it("round-trips a valid signal", () => {
    expect(HandoffSignalSchema.parse(SIGNAL)).toEqual(SIGNAL);
  });

  it("parses a signal with no severity (Loom/Maestro/artifact producers)", () => {
    const rest: Omit<typeof SIGNAL, "severity"> = {
      from: SIGNAL.from,
      kind: SIGNAL.kind,
      projectId: SIGNAL.projectId,
      title: SIGNAL.title,
      body: SIGNAL.body,
      fingerprint: SIGNAL.fingerprint,
    };
    expect(HandoffSignalSchema.parse(rest)).toEqual(rest);
  });

  it("rejects an unknown `from` subsystem", () => {
    expect(HandoffSignalSchema.safeParse({ ...SIGNAL, from: "not-a-subsystem" }).success).toBe(
      false,
    );
  });
});

describe("HandoffRuleSchema", () => {
  it("round-trips a valid rule", () => {
    expect(HandoffRuleSchema.parse(RULE)).toEqual(RULE);
  });

  it("accepts a wildcard signalKind", () => {
    const wildcard = { ...RULE, id: "loom-architecture", signalKind: "*", minSeverity: undefined };
    expect(HandoffRuleSchema.parse(wildcard).signalKind).toBe("*");
  });

  it("rejects an unknown `from` subsystem", () => {
    expect(HandoffRuleSchema.safeParse({ ...RULE, from: "not-a-subsystem" }).success).toBe(false);
  });

  it("rejects a tier outside 1|2|3", () => {
    expect(HandoffRuleSchema.safeParse({ ...RULE, tier: 4 }).success).toBe(false);
  });
});

describe("HandoffProposalSchema", () => {
  it("round-trips a valid proposal", () => {
    const proposal = {
      id: "handoff-proposal-1",
      ruleId: RULE.id,
      signal: SIGNAL,
      target: RULE.to,
      createdAt: "2026-07-22T00:00:00.000Z",
    };
    expect(HandoffProposalSchema.parse(proposal)).toEqual(proposal);
  });
});

describe("HandoffOutcomeSchema", () => {
  it("round-trips a dispatched outcome", () => {
    const outcome = { action: "dispatched", runRef: "task-1", target: RULE.to };
    expect(HandoffOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("round-trips a proposed outcome", () => {
    const outcome = { action: "proposed", approvalId: "approval-1" };
    expect(HandoffOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("round-trips a none outcome", () => {
    expect(HandoffOutcomeSchema.parse({ action: "none" })).toEqual({ action: "none" });
  });

  it("rejects an unknown action", () => {
    expect(HandoffOutcomeSchema.safeParse({ action: "skipped" }).success).toBe(false);
  });
});
