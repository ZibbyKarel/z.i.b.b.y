import { describe, expect, it } from "vitest";
import { PrThreadReplySchema } from "../tasks/task.schema";
import { inboxContract } from "./inbox.contract";
import {
  AddressInboxPrCommentsInputSchema,
  InboxPrSchema,
  InboxPrThreadSchema,
  PR_REVIEW_LEVELS,
  RebaseInboxPrInputSchema,
  ReplyInboxPrThreadInputSchema,
  ReviewInboxPrInputSchema,
} from "./inbox.schema";

const base = { projectId: "acme", repo: "acme/app", number: 7 };

describe("ReviewInboxPrInputSchema level (todo-4)", () => {
  it("lists the four levels, quick first (the default)", () => {
    expect(PR_REVIEW_LEVELS).toEqual(["quick", "thorough", "tested", "browser"]);
  });

  it("accepts every level and an omitted level", () => {
    for (const level of PR_REVIEW_LEVELS) {
      expect(ReviewInboxPrInputSchema.parse({ ...base, level }).level).toBe(level);
    }
    expect(ReviewInboxPrInputSchema.parse(base).level).toBeUndefined();
  });

  it("rejects an unknown level", () => {
    expect(ReviewInboxPrInputSchema.safeParse({ ...base, level: "deep" }).success).toBe(false);
  });
});

describe("RebaseInboxPrInputSchema (todo-11)", () => {
  it("accepts projectId/repo/number and an optional title", () => {
    expect(RebaseInboxPrInputSchema.parse({ ...base, title: "Fix" })).toEqual({
      ...base,
      title: "Fix",
    });
  });

  it("is strict — no level, no branch names from the client", () => {
    expect(RebaseInboxPrInputSchema.safeParse({ ...base, level: "quick" }).success).toBe(false);
    expect(RebaseInboxPrInputSchema.safeParse({ ...base, head: "main" }).success).toBe(false);
  });
});

describe("address review comments (PR inbox redesign)", () => {
  it("takes projectId/repo/number + optional title, strictly", () => {
    expect(AddressInboxPrCommentsInputSchema.parse({ ...base, title: "Fix" })).toEqual({
      ...base,
      title: "Fix",
    });
    expect(AddressInboxPrCommentsInputSchema.safeParse({ ...base, head: "feat" }).success).toBe(
      false,
    );
  });

  it("is POST /api/inbox/prs/address-comments", () => {
    expect(inboxContract.addressInboxPrComments.method).toBe("POST");
    expect(inboxContract.addressInboxPrComments.path).toBe("/api/inbox/prs/address-comments");
  });

  it("InboxPr carries the latest address-comments task state", () => {
    const pr = {
      source: "github",
      number: 7,
      title: "x",
      url: "https://github.com/acme/app/pull/7",
      repo: "acme/app",
      author: "me",
      createdAt: "2026-01-01T00:00:00.000Z",
      draft: false,
      ci: "passing",
      review: "changes-requested",
      mergeable: true,
      bucket: "mine",
      blocker: "changes-requested",
      section: "needs-action",
      projectId: "acme",
      addressComments: { taskId: "t1", state: "pushed" },
    };
    expect(InboxPrSchema.parse(pr).addressComments).toEqual({ taskId: "t1", state: "pushed" });
    expect(
      InboxPrSchema.safeParse({ ...pr, addressComments: { taskId: "t1", state: "merged" } })
        .success,
    ).toBe(false);
  });

  it("a thread reply is a PRRT_ node id + a short body (empty allowed)", () => {
    const ok = { threadId: "PRRT_kwDOabc", body: "Good catch, fixed in abc1234." };
    expect(PrThreadReplySchema.safeParse(ok).success).toBe(true);
    expect(PrThreadReplySchema.safeParse({ ...ok, threadId: "IC_123" }).success).toBe(false);
    expect(PrThreadReplySchema.safeParse({ ...ok, body: "  " }).success).toBe(true);
    expect(PrThreadReplySchema.safeParse({ ...ok, body: "x".repeat(501) }).success).toBe(false);
  });
});

describe("PR review threads", () => {
  it("ReplyInboxPrThreadInputSchema needs a body or resolve:true", () => {
    const ok = (v: unknown) => ReplyInboxPrThreadInputSchema.safeParse(v).success;
    expect(ok({ body: "x" })).toBe(true);
    expect(ok({ resolve: true })).toBe(true);
    expect(ok({ body: "x", resolve: false })).toBe(true);
    expect(ok({})).toBe(false);
    expect(ok({ resolve: false })).toBe(false);
    expect(ok({ body: "   " })).toBe(false);
  });

  it("InboxPrThreadSchema accepts null line and null author", () => {
    const thread = {
      id: "PRRT_abc",
      isResolved: false,
      isOutdated: false,
      path: "a.ts",
      line: null,
      startLine: null,
      diffHunk: "@@",
      comments: [{ id: "c1", author: null, createdAt: "2026-10-22T10:00:00.000Z", body: "hi" }],
    };
    expect(InboxPrThreadSchema.safeParse(thread).success).toBe(true);
    expect(InboxPrThreadSchema.safeParse({ ...thread, id: "x" }).success).toBe(false);
  });

  it("exposes the thread routes", () => {
    expect(inboxContract.getInboxPrThreads.path).toBe("/api/inbox/prs/:projectId/:number/threads");
    expect(inboxContract.replyInboxPrThread.path).toBe(
      "/api/inbox/prs/:projectId/:number/threads/:threadId/reply",
    );
  });
});
