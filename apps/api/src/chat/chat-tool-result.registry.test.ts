import { describe, expect, it } from "vitest";
import type { TaskTarget } from "@zibby/contracts";
import { ChatToolResultRegistry } from "./chat-tool-result.registry";

const AGENT_TARGET: TaskTarget = { kind: "agent", id: "builder", name: "Builder" };
const PIPELINE_TARGET: TaskTarget = { kind: "pipeline", id: "delivery", name: "Delivery" };

describe("ChatToolResultRegistry", () => {
  describe("create_task result queue", () => {
    it("drains undefined when nothing was queued for the conversation", () => {
      const registry = new ChatToolResultRegistry();
      expect(registry.drainCreateTaskResult("c1")).toBeUndefined();
    });

    it("queues and drains a single result FIFO", () => {
      const registry = new ChatToolResultRegistry();
      registry.pushCreateTaskResult("c1", { taskId: "t1", runRef: "r1", target: AGENT_TARGET });
      expect(registry.drainCreateTaskResult("c1")).toEqual({
        taskId: "t1",
        runRef: "r1",
        target: AGENT_TARGET,
      });
      // Drained once — the queue is now empty again.
      expect(registry.drainCreateTaskResult("c1")).toBeUndefined();
    });

    it("drains multiple queued results in arrival order", () => {
      const registry = new ChatToolResultRegistry();
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });
      registry.pushCreateTaskResult("c1", { taskId: "t2", target: PIPELINE_TARGET });
      expect(registry.drainCreateTaskResult("c1")?.taskId).toBe("t1");
      expect(registry.drainCreateTaskResult("c1")?.taskId).toBe("t2");
      expect(registry.drainCreateTaskResult("c1")).toBeUndefined();
    });

    it("keeps separate conversations' queues independent", () => {
      const registry = new ChatToolResultRegistry();
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });
      expect(registry.drainCreateTaskResult("c2")).toBeUndefined();
      expect(registry.drainCreateTaskResult("c1")?.taskId).toBe("t1");
    });
  });

  describe("create_task result push subscription", () => {
    it("delivers a pushed result directly to a live subscriber, skipping the queue", () => {
      const registry = new ChatToolResultRegistry();
      const received: unknown[] = [];
      registry.onCreateTaskResult("c1", (result) => received.push(result));
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });

      expect(received).toEqual([{ taskId: "t1", target: AGENT_TARGET }]);
      // Delivered straight to the subscriber — nothing left in the fallback queue.
      expect(registry.drainCreateTaskResult("c1")).toBeUndefined();
    });

    it("delivers each push in order to the same subscriber across multiple create_task calls", () => {
      const registry = new ChatToolResultRegistry();
      const received: string[] = [];
      registry.onCreateTaskResult("c1", (result) => received.push(result.taskId));
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });
      registry.pushCreateTaskResult("c1", { taskId: "t2", target: PIPELINE_TARGET });

      expect(received).toEqual(["t1", "t2"]);
    });

    it("falls back to the queue when no subscriber is registered", () => {
      const registry = new ChatToolResultRegistry();
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });
      expect(registry.drainCreateTaskResult("c1")?.taskId).toBe("t1");
    });

    it("stops delivering to an unsubscribed callback and falls back to the queue", () => {
      const registry = new ChatToolResultRegistry();
      const received: string[] = [];
      const unsubscribe = registry.onCreateTaskResult("c1", (result) =>
        received.push(result.taskId),
      );
      unsubscribe();
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });

      expect(received).toEqual([]);
      expect(registry.drainCreateTaskResult("c1")?.taskId).toBe("t1");
    });

    it("keeps separate conversations' subscriptions independent", () => {
      const registry = new ChatToolResultRegistry();
      const c1: string[] = [];
      const c2: string[] = [];
      registry.onCreateTaskResult("c1", (result) => c1.push(result.taskId));
      registry.onCreateTaskResult("c2", (result) => c2.push(result.taskId));
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });
      registry.pushCreateTaskResult("c2", { taskId: "t2", target: PIPELINE_TARGET });

      expect(c1).toEqual(["t1"]);
      expect(c2).toEqual(["t2"]);
    });

    it("a later subscribe call replaces the previous subscriber for the conversation", () => {
      const registry = new ChatToolResultRegistry();
      const first: string[] = [];
      const second: string[] = [];
      registry.onCreateTaskResult("c1", (result) => first.push(result.taskId));
      registry.onCreateTaskResult("c1", (result) => second.push(result.taskId));
      registry.pushCreateTaskResult("c1", { taskId: "t1", target: AGENT_TARGET });

      expect(first).toEqual([]);
      expect(second).toEqual(["t1"]);
    });
  });

  describe("explicit target", () => {
    it("returns undefined when nothing was set", () => {
      const registry = new ChatToolResultRegistry();
      expect(registry.getExplicitTarget("c1")).toBeUndefined();
    });

    it("holds a set target and keeps returning it on repeated reads (non-destructive)", () => {
      const registry = new ChatToolResultRegistry();
      registry.setExplicitTarget("c1", AGENT_TARGET);
      expect(registry.getExplicitTarget("c1")).toEqual(AGENT_TARGET);
      expect(registry.getExplicitTarget("c1")).toEqual(AGENT_TARGET);
    });

    it("clears the target so a later read sees nothing", () => {
      const registry = new ChatToolResultRegistry();
      registry.setExplicitTarget("c1", AGENT_TARGET);
      registry.clearExplicitTarget("c1");
      expect(registry.getExplicitTarget("c1")).toBeUndefined();
    });

    it("keeps separate conversations' targets independent", () => {
      const registry = new ChatToolResultRegistry();
      registry.setExplicitTarget("c1", AGENT_TARGET);
      registry.setExplicitTarget("c2", PIPELINE_TARGET);
      expect(registry.getExplicitTarget("c1")).toEqual(AGENT_TARGET);
      expect(registry.getExplicitTarget("c2")).toEqual(PIPELINE_TARGET);
      registry.clearExplicitTarget("c1");
      expect(registry.getExplicitTarget("c1")).toBeUndefined();
      expect(registry.getExplicitTarget("c2")).toEqual(PIPELINE_TARGET);
    });
  });
});
