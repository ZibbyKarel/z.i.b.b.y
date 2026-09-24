import { describe, expect, it } from "vitest";
import { releaseContract } from "./release.contract";
import { MergeQueueEntrySchema, MergeQueueQuerySchema, MergeQueueSchema } from "./release.schema";

const ENTRY = {
  number: 42,
  title: "Fix flaky test",
  url: "https://github.com/acme/app/pull/42",
  author: "alice",
  branch: "fix/flaky-test",
  draft: false,
  createdAt: "2026-07-01T09:00:00.000Z",
  projectId: "acme",
  projectName: "Acme",
  repo: "acme/app",
  checkState: "passing",
  reviewState: "approved",
  mergeable: "mergeable",
  ageHours: 12,
  queueState: "ready",
};

describe("release.schema", () => {
  it("round-trips a full merge-queue entry", () => {
    expect(MergeQueueEntrySchema.parse(ENTRY)).toEqual(ENTRY);
  });

  it("checkState/reviewState/mergeable/queueState are closed vocabularies", () => {
    expect(MergeQueueEntrySchema.safeParse({ ...ENTRY, checkState: "green" }).success).toBe(false);
    expect(MergeQueueEntrySchema.safeParse({ ...ENTRY, reviewState: "lgtm" }).success).toBe(false);
    expect(MergeQueueEntrySchema.safeParse({ ...ENTRY, mergeable: "dirty" }).success).toBe(false);
    expect(MergeQueueEntrySchema.safeParse({ ...ENTRY, queueState: "merged" }).success).toBe(false);
  });

  it("ageHours rejects negative values", () => {
    expect(MergeQueueEntrySchema.safeParse({ ...ENTRY, ageHours: -1 }).success).toBe(false);
  });

  it("the whole queue round-trips with generatedAt", () => {
    const queue = { entries: [ENTRY], generatedAt: "2026-07-17T00:00:00.000Z" };
    expect(MergeQueueSchema.parse(queue)).toEqual(queue);
    expect(MergeQueueSchema.parse({ entries: [], generatedAt: queue.generatedAt }).entries).toEqual(
      [],
    );
  });

  it("the query's projectId filter is optional; empty string rejected", () => {
    expect(MergeQueueQuerySchema.parse({})).toEqual({});
    expect(MergeQueueQuerySchema.safeParse({ projectId: "" }).success).toBe(false);
  });
});

describe("releaseContract", () => {
  it("is read-only under /api/release (no merge route — merging stays operator-only)", () => {
    expect(Object.keys(releaseContract)).toEqual(["getMergeQueue"]);
    expect(releaseContract.getMergeQueue.method).toBe("GET");
    expect(releaseContract.getMergeQueue.path).toBe("/api/release/queue");
  });
});
