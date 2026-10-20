import { describe, expect, it } from "vitest";
import { approvalOrigin, formatWaited, parseApprovalDetail, sourceLinkKind } from "./approval";

describe("parseApprovalDetail", () => {
  it("a pr-review splits into a one-line title and a markdown body preview", () => {
    const parsed = parseApprovalDetail({
      id: "a1",
      runId: "t1",
      kind: "pr-review",
      skill: "code-reviewer",
      action: "github.pr.review",
      detail: "Post review to GitHub — o/r#7 (COMMENT)\n\n## Review\n\nLooks **good**.",
      risk: "medium",
      status: "pending",
      requestedAt: "2026-10-16T10:00:00.000Z",
    });
    expect(parsed.detail).toBe("Post review to GitHub — o/r#7 (COMMENT)");
    expect(parsed.text).toBeUndefined();
    expect(parsed.preview).toEqual({
      kind: "message",
      to: "GitHub",
      body: "## Review\n\nLooks **good**.",
    });
  });
  it("a pr-address-comments splits like a pr-rebase", () => {
    const parsed = parseApprovalDetail({
      id: "a3",
      runId: "t3",
      kind: "pr-address-comments",
      skill: "fullstack-developer",
      action: "git.push",
      detail: "Push fixes — acme/app#7\n\nAddressed: partial",
      risk: "high",
      status: "pending",
      requestedAt: "2026-10-19T10:00:00.000Z",
    });
    expect(parsed.detail).toBe("Push fixes — acme/app#7");
    expect(parsed.preview).toEqual({ kind: "message", to: "GitHub", body: "Addressed: partial" });
  });
  it("a pr-rebase splits like a pr-review: title line + markdown report", () => {
    const parsed = parseApprovalDetail({
      id: "a2",
      runId: "t2",
      kind: "pr-rebase",
      skill: "rebase-resolver",
      action: "git.force_push",
      detail:
        "Force-push feat rebased onto main — o/r#7\n\nConflicts: 1 files\n\n- a.ts: kept both",
      risk: "high",
      status: "pending",
      requestedAt: "2026-10-19T10:00:00.000Z",
    });
    expect(parsed.detail).toBe("Force-push feat rebased onto main — o/r#7");
    expect(parsed.preview).toEqual({
      kind: "message",
      to: "GitHub",
      body: "Conflicts: 1 files\n\n- a.ts: kept both",
    });
  });
});

describe("approvalOrigin", () => {
  it("a pr-address-comments links its task", () => {
    expect(approvalOrigin({ kind: "pr-address-comments", runId: "t3", detail: "" })).toEqual({
      origin: "pr-review",
      href: "/work/tasks/t3",
    });
  });

  it("a pr-rebase links its task", () => {
    expect(approvalOrigin({ kind: "pr-rebase", runId: "t2", detail: "" })).toEqual({
      origin: "pr-review",
      href: "/work/tasks/t2",
    });
  });

  it("a task-backed approval takes the task's source and links the task", () => {
    expect(
      approvalOrigin({ kind: "task-output", runId: "t1", detail: "" }, { source: "automation" }),
    ).toEqual({
      origin: "automation",
      href: "/work/tasks/t1",
    });
    expect(approvalOrigin({ kind: "task", runId: "t1", detail: "" })).toMatchObject({
      origin: "operator",
    });
    expect(
      approvalOrigin(
        { kind: "task", runId: "t1", detail: "" },
        { source: "operator", roadmapItemId: "r1" },
      ),
    ).toMatchObject({ origin: "roadmap" });
  });

  it("a triage-filed Jira issue is a channel origin with its external link; by hand it is manual", () => {
    const url = "https://github.com/o/r/issues/7";
    expect(approvalOrigin({ kind: "jira-issue", runId: "x", detail: "", sourceUrl: url })).toEqual({
      origin: "channel",
      url,
    });
    expect(approvalOrigin({ kind: "jira-issue", runId: "x", detail: "Add login" })).toEqual({
      origin: "operator",
    });
    expect(
      approvalOrigin({
        kind: "jira-issue",
        runId: "x",
        detail: "Create Jira issue in AB: Bug from gh: crash",
      }),
    ).toEqual({ origin: "channel" });
  });

  it("a review rule links the owning project", () => {
    expect(approvalOrigin({ kind: "review-rule", runId: "p1/rule-a", detail: "" })).toMatchObject({
      origin: "pr-review",
      href: "/projects/p1",
    });
  });
});

describe("sourceLinkKind", () => {
  it("names GitHub PRs/issues, Jira and Slack links", () => {
    expect(sourceLinkKind("https://github.com/o/r/pull/12")).toBe("github-pr");
    expect(sourceLinkKind("https://github.com/o/r/issues/3")).toBe("github-issue");
    expect(sourceLinkKind("https://x.atlassian.net/browse/AB-1")).toBe("jira");
    expect(sourceLinkKind("https://team.slack.com/archives/C1/p1")).toBe("slack");
    expect(sourceLinkKind("https://example.com")).toBe("link");
  });
});

describe("formatWaited", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("renders minutes under an hour", () => {
    expect(formatWaited(new Date("2026-01-01T11:48:00.000Z").toISOString(), now)).toBe("12m");
  });

  it("renders hours under a day", () => {
    expect(formatWaited(new Date("2026-01-01T09:00:00.000Z").toISOString(), now)).toBe("3h");
  });

  it("renders days at and beyond a day", () => {
    expect(formatWaited(new Date("2025-12-30T12:00:00.000Z").toISOString(), now)).toBe("2d");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatWaited("not-a-date", now)).toBe("");
  });
});
