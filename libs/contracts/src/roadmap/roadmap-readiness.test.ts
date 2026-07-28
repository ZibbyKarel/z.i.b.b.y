import { describe, expect, it } from "vitest";
import type { RoadmapItem, RoadmapItemLifecycle } from "./roadmap-item.schema";
import { isBlocked, readiness } from "./roadmap-readiness";

const NOW = "2026-07-28T00:00:00.000Z";

function item(overrides: Partial<RoadmapItem> & { id: string }): RoadmapItem {
  return {
    projectId: "proj",
    level: "task",
    name: overrides.id,
    description: "",
    source: { kind: "manual" },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function storeOf(items: RoadmapItem[]): (id: string) => RoadmapItem | undefined {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (id: string) => byId.get(id);
}

function withLifecycle(
  id: string,
  lifecycle: RoadmapItemLifecycle,
  extra: Partial<RoadmapItem> = {},
) {
  return item({ id, lifecycle, ...extra });
}

describe("isBlocked", () => {
  it("is false with no dependencies", () => {
    const a = item({ id: "a" });
    expect(isBlocked(a, storeOf([a]))).toBe(false);
  });

  it("is true when a dependency is not done", () => {
    const a = item({ id: "a", dependsOn: ["b"] });
    const b = withLifecycle("b", "todo");
    expect(isBlocked(a, storeOf([a, b]))).toBe(true);
  });

  it("is false when every dependency is done", () => {
    const a = item({ id: "a", dependsOn: ["b"] });
    const b = withLifecycle("b", "done");
    expect(isBlocked(a, storeOf([a, b]))).toBe(false);
  });

  it("treats a missing/dangling dependency id as blocking", () => {
    const a = item({ id: "a", dependsOn: ["ghost"] });
    expect(isBlocked(a, storeOf([a]))).toBe(true);
  });

  it("overrideBlocked short-circuits to unblocked even with an unmet dependency", () => {
    const a = item({ id: "a", dependsOn: ["b"], overrideBlocked: true });
    const b = withLifecycle("b", "todo");
    expect(isBlocked(a, storeOf([a, b]))).toBe(false);
  });

  it("follows a dependency chain — B blocked on C blocks A on B even if C is later done", () => {
    const a = item({ id: "a", dependsOn: ["b"] });
    const b = item({ id: "b", dependsOn: ["c"], lifecycle: "todo" });
    const cNotDone = withLifecycle("c", "running");
    expect(isBlocked(b, storeOf([a, b, cNotDone]))).toBe(true);

    const cDone = withLifecycle("c", "done");
    expect(isBlocked(b, storeOf([a, b, cDone]))).toBe(false);
  });
});

describe("readiness", () => {
  it("done beats blocked — a finished item stays done even with an unmet dependency", () => {
    const a = item({ id: "a", dependsOn: ["b"], lifecycle: "done" });
    const b = withLifecycle("b", "todo");
    expect(readiness(a, storeOf([a, b]))).toBe("done");
  });

  it("archived beats blocked", () => {
    const a = item({ id: "a", dependsOn: ["b"], lifecycle: "archived" });
    const b = withLifecycle("b", "todo");
    expect(readiness(a, storeOf([a, b]))).toBe("archived");
  });

  it("enqueued + blocked -> blocked", () => {
    const a = item({ id: "a", dependsOn: ["b"], lifecycle: "enqueued" });
    const b = withLifecycle("b", "todo");
    expect(readiness(a, storeOf([a, b]))).toBe("blocked");
  });

  it("enqueued + unblocked -> in-progress (already queued, about to dispatch)", () => {
    const a = item({ id: "a", dependsOn: ["b"], lifecycle: "enqueued" });
    const b = withLifecycle("b", "done");
    expect(readiness(a, storeOf([a, b]))).toBe("in-progress");
  });

  it("running and awaiting-merge -> in-progress", () => {
    const running = withLifecycle("r", "running");
    const awaitingMerge = withLifecycle("m", "awaiting-merge");
    expect(readiness(running, storeOf([running]))).toBe("in-progress");
    expect(readiness(awaitingMerge, storeOf([awaitingMerge]))).toBe("in-progress");
  });

  it("failed -> ready (never its own column, still actionable)", () => {
    const a = withLifecycle("a", "failed");
    expect(readiness(a, storeOf([a]))).toBe("ready");
  });

  it("failed still blocks a dependent (does not count as done)", () => {
    const a = item({ id: "a", dependsOn: ["b"], lifecycle: "todo" });
    const b = withLifecycle("b", "failed");
    expect(readiness(a, storeOf([a, b]))).toBe("blocked");
  });

  it("todo with no dependencies -> ready", () => {
    const a = item({ id: "a", lifecycle: "todo" });
    expect(readiness(a, storeOf([a]))).toBe("ready");
  });

  it("overrideBlocked unblocks readiness the same way it unblocks isBlocked", () => {
    const a = item({ id: "a", dependsOn: ["b"], lifecycle: "todo", overrideBlocked: true });
    const b = withLifecycle("b", "todo");
    expect(readiness(a, storeOf([a, b]))).toBe("ready");
  });
});
