import type { InboxPr } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { prStack, prStatus } from "./prStatus";

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
