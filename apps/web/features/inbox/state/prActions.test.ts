import type { InboxPr } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  SETTLE_MS,
  handled,
  hasPrActions,
  hasThreadsToAddress,
  isFix,
  isMerge,
  isRebase,
  isReview,
} from "./prActions";

const pr = (over: Partial<InboxPr> = {}): InboxPr => ({ bucket: "mine", ...over }) as InboxPr;
const T0 = "2026-10-21T10:00:00.000Z";
const after = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

describe("handled", () => {
  it("is false without a finished run or without updatedAt", () => {
    expect(handled(pr({ updatedAt: T0 }))).toBe(false);
    expect(handled(pr({ updatedAt: T0 }), {})).toBe(false);
    expect(handled(pr(), { finishedAt: T0 })).toBe(false);
  });
  it("absorbs changes within the 60s settle window, not beyond", () => {
    expect(SETTLE_MS).toBe(60_000);
    expect(handled(pr({ updatedAt: after(-1) }), { finishedAt: T0 })).toBe(true);
    expect(handled(pr({ updatedAt: after(SETTLE_MS) }), { finishedAt: T0 })).toBe(true);
    expect(handled(pr({ updatedAt: after(SETTLE_MS + 1) }), { finishedAt: T0 })).toBe(false);
  });
});

describe("isReview", () => {
  const base = { bucket: "to-review" } as const;
  it("offers a to-review PR, draft or not", () => {
    expect(isReview(pr(base))).toBe(true);
    expect(isReview(pr({ ...base, draft: true }))).toBe(true);
  });
  it("not for other buckets", () => {
    expect(isReview(pr({ bucket: "mine" }))).toBe(false);
  });
  it("hides once the review is handled, returns after a later change", () => {
    const codeReview = { taskId: "t", state: "posted", finishedAt: T0 } as InboxPr["codeReview"];
    expect(isReview(pr({ ...base, codeReview, updatedAt: T0 }))).toBe(false);
    expect(isReview(pr({ ...base, codeReview, updatedAt: after(SETTLE_MS + 1) }))).toBe(true);
  });
});

describe("hasThreadsToAddress", () => {
  it("falls back to blocker when the thread count is unknown", () => {
    expect(hasThreadsToAddress(pr({ blocker: "changes-requested" }))).toBe(true);
    expect(hasThreadsToAddress(pr({}))).toBe(false);
  });
  it("uses the count when known, even over the blocker", () => {
    expect(hasThreadsToAddress(pr({ unresolvedThreads: 2 }))).toBe(true);
    expect(hasThreadsToAddress(pr({ unresolvedThreads: 0, blocker: "changes-requested" }))).toBe(
      false,
    );
  });
});

describe("isFix", () => {
  const base = { headRef: "feat", unresolvedThreads: 1 };
  it("offers on my PR with a head ref and threads", () => {
    expect(isFix(pr(base))).toBe(true);
  });
  it("needs headRef, threads and the mine bucket", () => {
    expect(isFix(pr({ ...base, headRef: undefined }))).toBe(false);
    expect(isFix(pr({ ...base, unresolvedThreads: 0 }))).toBe(false);
    expect(isFix(pr({ ...base, bucket: "other" as InboxPr["bucket"] }))).toBe(false);
  });
  it("hides once handled", () => {
    const addressComments = {
      taskId: "t",
      state: "pushed",
      finishedAt: T0,
    } as InboxPr["addressComments"];
    expect(isFix(pr({ ...base, addressComments, updatedAt: T0 }))).toBe(false);
  });
});

describe("isRebase", () => {
  it("offers when conflicting or behind", () => {
    expect(isRebase(pr({ mergeable: false }))).toBe(true);
    expect(isRebase(pr({ behind: true }))).toBe(true);
  });
  it("never as a fallback", () => {
    expect(isRebase(pr({}))).toBe(false);
    expect(isRebase(pr({ mergeable: true, behind: false }))).toBe(false);
  });
  it("yields to fix", () => {
    expect(isRebase(pr({ mergeable: false, headRef: "f", unresolvedThreads: 1 }))).toBe(false);
  });
});

describe("isMerge", () => {
  it("is the ready-to-merge section", () => {
    expect(isMerge(pr({ section: "ready-to-merge" }))).toBe(true);
    expect(isMerge(pr({}))).toBe(false);
  });
});

describe("hasPrActions", () => {
  it("is true for any offered action", () => {
    expect(hasPrActions(pr({ section: "ready-to-merge" }))).toBe(true);
    expect(hasPrActions(pr({ bucket: "to-review" }))).toBe(true);
  });
  it("is true for in-flight or failed runs, false for done ones", () => {
    const run = (state: string) => ({ taskId: "t", state }) as InboxPr["rebase"];
    expect(hasPrActions(pr({ rebase: run("running") }))).toBe(true);
    expect(hasPrActions(pr({ rebase: run("awaiting-approval") }))).toBe(true);
    expect(hasPrActions(pr({ rebase: run("failed") }))).toBe(true);
    expect(hasPrActions(pr({ rebase: run("done") }))).toBe(false);
  });
  it("offers review on a draft to-review PR", () => {
    expect(hasPrActions(pr({ bucket: "to-review", draft: true }))).toBe(true);
  });
});
