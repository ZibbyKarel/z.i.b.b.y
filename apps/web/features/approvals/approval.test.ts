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
});

describe("approvalOrigin", () => {
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
