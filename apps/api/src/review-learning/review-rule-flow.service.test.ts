import type { Approval, ReviewRule } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RequestApprovalInput } from "../approvals/approvals.service";
import {
  ReviewRuleFlowService,
  parseReviewRuleRunId,
  reviewRuleRunId,
} from "./review-rule-flow.service";

const RULE: ReviewRule = {
  id: "no-local-primitives",
  scope: "project",
  rule: "Primitivy ber z libs/design-system.",
  rationale: "Opakovaná výtka.",
  status: "proposed",
  occurrences: [
    {
      commentId: "rc-1",
      prUrl: "https://github.com/acme/app/pull/7",
      commentUrl: "https://github.com/acme/app/pull/7#discussion_r1",
      author: "kolega",
      at: "2026-07-29T09:00:00.000Z",
      excerpt: "patří do design systemu",
    },
    {
      commentId: "rc-2",
      prUrl: "https://github.com/acme/app/pull/9",
      commentUrl: "https://github.com/acme/app/pull/9#discussion_r2",
      author: "kolega",
      at: "2026-07-29T09:30:00.000Z",
      excerpt: "zase mimo design system",
    },
  ],
  createdAt: "2026-07-29T09:00:00.000Z",
  updatedAt: "2026-07-29T09:30:00.000Z",
};

function approval(over: Partial<Approval> = {}): Approval {
  return {
    id: "ap-1",
    runId: "acme/no-local-primitives",
    kind: "review-rule",
    skill: "review-learning",
    action: "review.rule_adopt",
    detail: "{}",
    risk: "low",
    status: "approved",
    requestedAt: "2026-07-29T10:00:00.000Z",
    ...over,
  };
}

function makeFlow(rule: ReviewRule | null = RULE, approved: Approval[] = [approval()]) {
  const approvals = {
    register: vi.fn(),
    requestApproval: vi.fn<(input: RequestApprovalInput) => Promise<{ id: string }>>(async () => ({
      id: "ap-1",
    })),
    list: vi.fn(async () => approved),
  };
  const store = {
    setStatus: vi.fn(async () => rule),
  };
  const vault = { render: vi.fn(async () => {}), renderGlobal: vi.fn(async () => {}) };
  const logger = {
    child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
  };
  const flow = new ReviewRuleFlowService(
    approvals as never,
    store as never,
    vault as never,
    logger as never,
  );
  return { flow, approvals, store, vault };
}

describe("reviewRuleRunId", () => {
  it("round-trips a project and rule id", () => {
    const runId = reviewRuleRunId("acme", "no-any");
    expect(parseReviewRuleRunId(runId)).toEqual({ projectId: "acme", ruleId: "no-any" });
  });

  it("returns null for a malformed run id", () => {
    expect(parseReviewRuleRunId("nonsense")).toBeNull();
  });
});

describe("ReviewRuleFlowService", () => {
  it("registers itself as the review-rule runner", () => {
    const { flow, approvals } = makeFlow();
    flow.onModuleInit();
    expect(approvals.register).toHaveBeenCalledWith("review-rule", flow);
  });

  it("parks a Tier-3 approval carrying the rule and both occurrences", async () => {
    const { flow, approvals } = makeFlow();

    await flow.propose("acme", RULE);

    const request = approvals.requestApproval.mock.calls[0]![0];
    expect(request.kind).toBe("review-rule");
    expect(request.runId).toBe("acme/no-local-primitives");
    const detail = JSON.parse(request.detail);
    expect(detail.summary).toContain("Primitivy ber z libs/design-system.");
    expect(JSON.stringify(detail)).toContain("pull/7");
    expect(JSON.stringify(detail)).toContain("pull/9");
  });

  it("approve activates the rule, stamps the approving approval, and re-renders the project note", async () => {
    const { flow, store, vault } = makeFlow();

    await flow.resume("acme/no-local-primitives");

    // `ReviewRule.approvalRef` is the forensic link back to the decision that
    // activated the rule — it must carry the real approval id, not `undefined`.
    expect(store.setStatus).toHaveBeenCalledWith("acme", "no-local-primitives", "active", "ap-1");
    expect(vault.render).toHaveBeenCalledWith("acme");
  });

  it("ignores an approved approval belonging to another rule or another kind", async () => {
    const { flow, store } = makeFlow(RULE, [
      approval({ id: "ap-other-run", runId: "acme/some-other-rule" }),
      approval({ id: "ap-other-kind", kind: "agent-proposal" }),
      approval({ id: "ap-2", requestedAt: "2026-07-29T11:00:00.000Z" }),
    ]);

    await flow.resume("acme/no-local-primitives");

    expect(store.setStatus).toHaveBeenCalledWith("acme", "no-local-primitives", "active", "ap-2");
  });

  it("still activates when the approval lookup fails, just without an approvalRef", async () => {
    const { flow, store, approvals } = makeFlow();
    approvals.list.mockRejectedValueOnce(new Error("approvals unreadable"));

    await flow.resume("acme/no-local-primitives");

    expect(store.setStatus).toHaveBeenCalledWith(
      "acme",
      "no-local-primitives",
      "active",
      undefined,
    );
  });

  it("reject retires the rule and does not render", async () => {
    const { flow, store, vault } = makeFlow();

    await flow.cancel("acme/no-local-primitives");

    expect(store.setStatus).toHaveBeenCalledWith("acme", "no-local-primitives", "retired");
    expect(vault.render).not.toHaveBeenCalled();
  });

  it("ignores a decision on an unknown run id", async () => {
    const { flow, store } = makeFlow();

    await flow.resume("nonsense");

    expect(store.setStatus).not.toHaveBeenCalled();
  });

  it("cancel does not reject when the store write fails (fact #1: unawaited by ApprovalsService)", async () => {
    const { flow, store } = makeFlow();
    store.setStatus.mockRejectedValueOnce(new Error("disk full"));

    await expect(flow.cancel("acme/no-local-primitives")).resolves.toBeUndefined();
  });
});
