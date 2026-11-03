import { ChatAboutSchema } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { InboxPrThread } from "@zibby/contracts";
import { noteChatAbout, threadChatAbout } from "./chatAbout";

describe("noteChatAbout", () => {
  it("stays inside the ChatAbout schema caps for a huge, multi-line note", () => {
    const about = noteChatAbout(
      { id: "notes/a.md", title: `Title\n${"x".repeat(500)}`, body: "y".repeat(30_000) },
      "core",
      "/knowledge/vault?note=a",
    );
    expect(ChatAboutSchema.parse(about)).toEqual(about);
    expect(about.details).toContain("Team: core");
  });
});

describe("threadChatAbout", () => {
  const thread: InboxPrThread = {
    id: "PRRT_abc",
    isResolved: false,
    isOutdated: true,
    path: "src/a.ts",
    line: 12,
    startLine: null,
    diffHunk: "@@ -1 +1 @@\n+x",
    url: "https://github.com/o/r/pull/1#discussion_r9",
    comments: [
      {
        id: "c1",
        author: { login: "alice", avatarUrl: "" },
        createdAt: "2026-10-22T11:56:00Z",
        body: "rename this",
      },
    ],
  };

  it("references the thread by id with its location, url and comments", () => {
    const about = threadChatAbout(thread, { pr: "o/r#1" });
    expect(ChatAboutSchema.parse(about)).toEqual(about);
    expect(about).toMatchObject({ kind: "thread", id: "PRRT_abc", href: thread.url });
    expect(about.label).toBe("Thread · src/a.ts:12");
    expect(about.details).toContain("PR: o/r#1");
    expect(about.details).toContain("alice (2026-10-22T11:56:00Z):\nrename this");
  });

  it("stays inside the schema caps for huge comments", () => {
    const big = { ...thread, comments: [{ ...thread.comments[0]!, body: "z".repeat(40_000) }] };
    const about = threadChatAbout(big);
    expect(ChatAboutSchema.parse(about)).toEqual(about);
  });
});
