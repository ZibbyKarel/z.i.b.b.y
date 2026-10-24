import { describe, expect, it } from "vitest";
import { ACTIVITY_GROUP_OF } from "../activity/activity-view.schema";
import { ActivityKindSchema } from "../activity/activity.schema";
import { appContract } from "../app.contract";
import { proposalsContract } from "./proposals.contract";
import {
  DecideProposalInputSchema,
  PROPOSAL_TEXT_MAX,
  ProposalConfidenceSchema,
  ProposalSchema,
  ProposalSourceSchema,
  ProposalStatusSchema,
} from "./proposal.schema";

const PROPOSAL = {
  id: "prop_0123456789ab",
  source: "pattern-extract",
  text: 'Always allow "deploy" (approved 3× in the past 30 days)',
  confidence: "low",
  occurrences: 3,
  provenance: { automationId: "nightly-patterns", noteId: "patterns/suggestions" },
  createdAt: "2026-10-24T08:00:00.000Z",
  lastSeenAt: "2026-10-24T08:00:00.000Z",
  expiresAt: "2026-11-23T08:00:00.000Z",
  status: "open",
};

describe("ProposalSchema", () => {
  it("round-trips a full record", () => {
    const full = {
      ...PROPOSAL,
      editedText: "Allow deploy",
      status: "dismissed",
      decidedAt: "2026-10-24T09:00:00.000Z",
    };
    expect(ProposalSchema.parse(full)).toEqual(full);
    expect(ProposalSchema.parse(PROPOSAL)).toEqual(PROPOSAL);
  });

  it("closes the source/confidence/status vocabularies", () => {
    expect(ProposalSourceSchema.options).toEqual([
      "pattern-extract",
      "gap-detect",
      "agent-factory",
    ]);
    expect(ProposalConfidenceSchema.options).toEqual(["low", "medium", "high"]);
    expect(ProposalStatusSchema.options).toEqual(["open", "dismissed"]);
    expect(ProposalSchema.safeParse({ ...PROPOSAL, source: "security-scan" }).success).toBe(false);
  });

  it("caps text and editedText at 500 chars", () => {
    expect(PROPOSAL_TEXT_MAX).toBe(500);
    expect(ProposalSchema.safeParse({ ...PROPOSAL, text: "x".repeat(500) }).success).toBe(true);
    expect(ProposalSchema.safeParse({ ...PROPOSAL, text: "x".repeat(501) }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...PROPOSAL, editedText: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("provenance is strict — no smuggled keys", () => {
    expect(
      ProposalSchema.safeParse({ ...PROPOSAL, provenance: { noteId: "a", tier: "allow" } }).success,
    ).toBe(false);
  });
});

describe("DecideProposalInputSchema", () => {
  it("accepts dismiss and edit (1–500 chars)", () => {
    expect(DecideProposalInputSchema.parse({ action: "dismiss" })).toEqual({ action: "dismiss" });
    expect(DecideProposalInputSchema.parse({ action: "edit", text: "x" })).toEqual({
      action: "edit",
      text: "x",
    });
    expect(DecideProposalInputSchema.safeParse({ action: "edit", text: "" }).success).toBe(false);
    expect(
      DecideProposalInputSchema.safeParse({ action: "edit", text: "x".repeat(501) }).success,
    ).toBe(false);
    expect(DecideProposalInputSchema.safeParse({ action: "approve" }).success).toBe(false);
  });
});

describe("proposalsContract", () => {
  it("exposes list (GET) and decide (PATCH /:id) under /api/proposals", () => {
    expect(Object.keys(proposalsContract)).toEqual(["listProposals", "decideProposal"]);
    expect(proposalsContract.listProposals.method).toBe("GET");
    expect(proposalsContract.listProposals.path).toBe("/api/proposals");
    expect(proposalsContract.decideProposal.method).toBe("PATCH");
    expect(proposalsContract.decideProposal.path).toBe("/api/proposals/:id");
    expect(Object.keys(proposalsContract.decideProposal.responses).sort()).toEqual([
      "200",
      "404",
      "409",
    ]);
    expect(appContract.proposals.listProposals.path).toBe("/api/proposals");
  });

  it("adds the proposal-decided activity kind with a display group", () => {
    expect(ActivityKindSchema.options).toContain("proposal-decided");
    expect(ACTIVITY_GROUP_OF["proposal-decided"]).toBe("approvals");
  });
});
