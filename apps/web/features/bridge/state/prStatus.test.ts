import type { InboxPr } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { prCiState, prReviewState, prStack, prStatus } from "./prStatus";

const pr = (over: Partial<InboxPr> = {}): InboxPr => ({
  source: "github",
  number: 1,
  title: "t",
  url: `https://github.com/o/r/pull/${over.number ?? 1}`,
  repo: "o/r",
  author: "a",
  createdAt: "2026-10-01T00:00:00.000Z",
  draft: false,
  ci: "passing",
  review: "none",
  mergeable: true,
  bucket: "mine",
  blocker: "awaiting-review",
  section: "waiting",
  projectId: "p",
  ...over,
});

describe("prStatus precedence", () => {
  it("review requested beats draft and CI", () => {
    expect(prStatus(pr({ bucket: "to-review", draft: true, ci: "failing" }))).toEqual({
      tone: "think",
      label: "REVIEW REQUESTED",
    });
  });
  it("walks draft, ci, conflict, changes, running, approved, awaiting", () => {
    expect(prStatus(pr({ draft: true, ci: "failing" })).tone).toBe("draft");
    expect(prStatus(pr({ ci: "failing", review: "changes-requested" }))).toEqual({
      tone: "err",
      label: "CI FAILING",
    });
    expect(prStatus(pr({ mergeable: false, review: "changes-requested" })).label).toBe(
      "MERGE CONFLICT",
    );
    expect(prStatus(pr({ review: "changes-requested", ci: "pending" })).label).toBe(
      "CHANGES REQUESTED",
    );
    expect(prStatus(pr({ ci: "pending", review: "approved" })).label).toBe("CHECKS RUNNING");
    expect(prStatus(pr({ review: "approved" }))).toEqual({ tone: "done", label: "APPROVED" });
    expect(prStatus(pr())).toEqual({ tone: "idle", label: "AWAITING REVIEW" });
  });
  it("a to-review PR that is ready to merge falls through", () => {
    expect(
      prStatus(pr({ bucket: "to-review", blocker: "ready-to-merge", review: "approved" })).label,
    ).toBe("APPROVED");
  });
});

describe("prStack", () => {
  const a = pr({ number: 1, headRef: "a", baseRef: "main" });
  const b = pr({ number: 2, headRef: "b", baseRef: "a" });
  const c = pr({ number: 3, headRef: "c", baseRef: "b" });
  const other = pr({ number: 4, repo: "o/x", headRef: "z", baseRef: "c" });
  it("returns ancestors root first, same repo only", () => {
    expect(prStack(c, [a, b, c, other]).map((p) => p.number)).toEqual([1, 2]);
    expect(prStack(a, [a, b, c])).toEqual([]);
    expect(prStack(other, [a, b, c, other])).toEqual([]);
  });
});

describe("card slots", () => {
  const head = "b".repeat(40);
  it("CI: conflict > failing > running > passing > none", () => {
    expect(prCiState(pr({ mergeable: false, ci: "failing" }))).toBe("conflict");
    expect(prCiState(pr({ ci: "failing" }))).toBe("failing");
    expect(prCiState(pr({ ci: "pending" }))).toBe("running");
    expect(prCiState(pr())).toBe("passing");
    expect(prCiState(pr({ ci: "unknown", mergeable: null }))).toBe("none");
  });

  it("own PR: changes > approved by a colleague > awaiting review", () => {
    expect(prReviewState(pr({ review: "changes-requested" }))).toBe("changes");
    expect(prReviewState(pr({ review: "approved" }))).toBe("approved");
    expect(prReviewState(pr())).toBe("review");
  });

  it("own draft: a colleague's approval doesn't read as approved (it still can't merge)", () => {
    expect(prReviewState(pr({ draft: true, review: "approved" }))).toBe("review");
    expect(prReviewState(pr({ draft: true, review: "changes-requested" }))).toBe("changes");
  });

  it("others' PR: my current approval wins, even over changes from someone else", () => {
    const approved = { myReview: "approved" as const, myReviewSha: head, headSha: head };
    expect(
      prReviewState(pr({ bucket: "reviewed", review: "changes-requested", ...approved })),
    ).toBe("approved");
    // a team request still open after my approval doesn't bring it back
    expect(prReviewState(pr({ bucket: "to-review", reviewReason: "team", ...approved }))).toBe(
      "approved",
    );
  });

  it("others' PR: a re-request or new commits after my approval want my review again", () => {
    const approved = { myReview: "approved" as const, myReviewSha: head, headSha: head };
    expect(prReviewState(pr({ bucket: "to-review", reviewReason: "direct", ...approved }))).toBe(
      "review",
    );
    expect(prReviewState(pr({ bucket: "reviewed", ...approved, headSha: "c".repeat(40) }))).toBe(
      "review",
    );
    expect(prReviewState(pr({ bucket: "to-review" }))).toBe("review");
  });

  it("others' PR: changes requested, else waiting", () => {
    expect(
      prReviewState(
        pr({ bucket: "reviewed", myReview: "changes-requested", review: "changes-requested" }),
      ),
    ).toBe("changes");
    expect(prReviewState(pr({ bucket: "reviewed", myReview: "commented" }))).toBe("waiting");
  });
});
