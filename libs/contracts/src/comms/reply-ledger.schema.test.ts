import { describe, expect, it } from "vitest";
import {
  ApprovalRunKindSchema,
  HeraldGraduationSchema,
  ReplyLedgerEntrySchema,
  ReplyLedgerOutcomeSchema,
  TriageCategorySchema,
  TriageVerdictSchema,
} from "../index";

describe("ReplyLedgerOutcomeSchema", () => {
  it("accepts every real outcome, including the reserved 'edited' slot", () => {
    for (const outcome of ["pending", "sent-auto", "approved", "rejected", "edited"]) {
      expect(ReplyLedgerOutcomeSchema.safeParse(outcome).success).toBe(true);
    }
  });

  it("rejects an unknown outcome", () => {
    expect(ReplyLedgerOutcomeSchema.safeParse("ignored").success).toBe(false);
  });
});

describe("ReplyLedgerEntrySchema", () => {
  const base = {
    id: "entry_1",
    integrationId: "team",
    kind: "slack" as const,
    itemId: "C1-100",
    category: "question" as const,
    confidence: 0.8,
    tier: 2 as const,
    outcome: "pending" as const,
    proposedAt: "2026-07-17T05:00:00.000Z",
  };

  it("accepts a minimal pending entry", () => {
    expect(ReplyLedgerEntrySchema.safeParse(base).success).toBe(true);
  });

  it("accepts a decided entry with projectId/approvalId/decidedAt", () => {
    const parsed = ReplyLedgerEntrySchema.safeParse({
      ...base,
      projectId: "acme-app",
      approvalId: "appr_1",
      outcome: "approved",
      decidedAt: "2026-07-17T06:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an out-of-range confidence", () => {
    expect(ReplyLedgerEntrySchema.safeParse({ ...base, confidence: 1.2 }).success).toBe(false);
  });

  it("shares its category enum with TriageVerdict", () => {
    const verdict = {
      actionable: true,
      tier: 2 as const,
      confidence: 0.8,
      reason: "r",
    };
    for (const category of TriageCategorySchema.options) {
      expect(ReplyLedgerEntrySchema.safeParse({ ...base, category }).success).toBe(true);
      expect(TriageVerdictSchema.safeParse({ ...verdict, category }).success).toBe(true);
    }
  });
});

describe("HeraldGraduationSchema", () => {
  it("accepts a graduated pair", () => {
    const parsed = HeraldGraduationSchema.safeParse({
      integrationId: "team",
      kind: "slack",
      category: "question",
      evidenceCount: 10,
      approvalId: "appr_1",
      graduatedAt: "2026-07-17T06:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-positive evidenceCount", () => {
    const parsed = HeraldGraduationSchema.safeParse({
      integrationId: "team",
      kind: "slack",
      category: "question",
      evidenceCount: 0,
      approvalId: "appr_1",
      graduatedAt: "2026-07-17T06:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("ApprovalRunKindSchema", () => {
  it("includes herald-graduation", () => {
    expect(ApprovalRunKindSchema.safeParse("herald-graduation").success).toBe(true);
  });
});
