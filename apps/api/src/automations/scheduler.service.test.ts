import type { Automation } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { SchedulerService } from "./scheduler.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};
const fakeTrace = { run: (_ctx: unknown, fn: () => unknown) => fn() };

function agentFactoryAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "agent-factory-nightly",
    name: "Agent Factory",
    trigger: { type: "cron", expr: "0 4 * * *" },
    target: { type: "agent-factory" },
    enabled: true,
    system: false,
    ...over,
  };
}

function pipelineAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "nightly-pipeline",
    name: "Nightly pipeline",
    trigger: { type: "cron", expr: "0 3 * * *" },
    target: { type: "pipeline", pipelineId: "release" },
    enabled: true,
    system: false,
    ...over,
  };
}

function taskAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "prompt-automation",
    name: "Prompt automation",
    trigger: { type: "cron", expr: "0 9 * * *" },
    target: { type: "task", text: "check the inbox" },
    enabled: true,
    system: false,
    ...over,
  };
}

function selfKnowledgeAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "self-knowledge-refresh",
    name: "Obnova sebeznalosti",
    trigger: { type: "cron", expr: "30 3 * * *" },
    target: { type: "self-knowledge" },
    enabled: true,
    system: true,
    ...over,
  };
}

/** Build a SchedulerService with every non-exercised dependency stubbed to a
 * no-op — each describe block below only wires the dependency its own case needs. */
function makeService(opts: {
  automation: Automation;
  detect?: ReturnType<typeof vi.fn>;
  pipelineRunner?: { start: ReturnType<typeof vi.fn> };
  taskScheduler?: { createTask: ReturnType<typeof vi.fn> };
  selfKnowledge?: { check: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
}): { service: SchedulerService; storage: { markFired: ReturnType<typeof vi.fn> } } {
  const storage = {
    list: async () => [opts.automation],
    get: async (id: string) => {
      if (id !== opts.automation.id) throw new Error("not found");
      return opts.automation;
    },
    markFired: vi.fn(async () => opts.automation),
  };
  const noRunner = { start: vi.fn() };
  const service = new SchedulerService(
    storage as never,
    noRunner as never,
    (opts.pipelineRunner ?? noRunner) as never,
    fakeLogger as never,
    fakeTrace as never,
    { generate: vi.fn() } as never,
    { distill: vi.fn() } as never,
    { extract: vi.fn() } as never,
    { detect: vi.fn() } as never,
    fakeSystemConfigStore(),
    { detect: opts.detect ?? vi.fn() } as never,
    (opts.taskScheduler ?? { createTask: vi.fn() }) as never,
    (opts.selfKnowledge ?? { check: vi.fn(async () => false), write: vi.fn() }) as never,
  );
  return { service, storage };
}

describe("SchedulerService — dispatch (Phase 4b: agent-factory case)", () => {
  it("dispatches the agent-factory target straight to AgentFactoryService.detect and refs the count", async () => {
    const detect = vi.fn(async () => ({
      proposed: ["auto-deploy-staging", "auto-fix-flaky-test"],
    }));
    const { service } = makeService({ automation: agentFactoryAutomation(), detect });

    const ref = await service.trigger("agent-factory-nightly");

    expect(detect).toHaveBeenCalledTimes(1);
    expect(ref).toBe("agent-proposals:2");
  });

  it("refs a zero count when nothing qualifies", async () => {
    const detect = vi.fn(async () => ({ proposed: [] }));
    const { service } = makeService({ automation: agentFactoryAutomation(), detect });

    expect(await service.trigger("agent-factory-nightly")).toBe("agent-proposals:0");
  });
});

describe("SchedulerService — dispatch (Phase 116b: pipeline prompt forwarding)", () => {
  it("forwards the automation's prompt into PipelineRunnerService.start's input param", async () => {
    const start = vi.fn(async () => ({ pipelineRunId: "release_1" }));
    const { service } = makeService({
      automation: pipelineAutomation({ prompt: "focus on regressions" }),
      pipelineRunner: { start },
    });

    const ref = await service.trigger("nightly-pipeline");

    expect(start).toHaveBeenCalledWith(
      "release",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "focus on regressions",
    );
    expect(ref).toBe("release_1");
  });

  it("forwards undefined when the automation carries no prompt (no behaviour change)", async () => {
    const start = vi.fn(async () => ({ pipelineRunId: "release_2" }));
    const { service } = makeService({
      automation: pipelineAutomation(),
      pipelineRunner: { start },
    });

    await service.trigger("nightly-pipeline");

    expect(start).toHaveBeenCalledWith(
      "release",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
});

describe("SchedulerService — dispatch (Phase 116b: task target)", () => {
  it("fires a task-target automation through TaskSchedulerService.createTask and refs the run", async () => {
    const createTask = vi.fn(async () => ({
      outcome: "dispatched" as const,
      runRef: "writer_1_1",
      target: { kind: "agent" as const, id: "writer", name: "Writer" },
      task: { id: "task_1" },
    }));
    const { service } = makeService({
      automation: taskAutomation({
        target: { type: "task", text: "check the inbox", attachmentSetId: "set_1" },
      }),
      taskScheduler: { createTask },
    });

    const ref = await service.trigger("prompt-automation");

    expect(createTask).toHaveBeenCalledWith(
      {
        text: "check the inbox",
        target: undefined,
        attachmentSetId: "set_1",
        output: undefined,
        toolGrants: undefined,
      },
      expect.any(Number),
      undefined,
      undefined,
      false,
    );
    expect(ref).toBe("writer_1_1");
  });

  it("forwards an explicit @-mentioned target and bypasses classification", async () => {
    const explicitTarget = { kind: "pipeline" as const, id: "code-audit", name: "Code audit" };
    const createTask = vi.fn(async () => ({
      outcome: "dispatched" as const,
      runRef: "code-audit_1",
      target: explicitTarget,
      task: { id: "task_2" },
    }));
    const { service } = makeService({
      automation: taskAutomation({
        target: { type: "task", text: "audit the repo", target: explicitTarget },
      }),
      taskScheduler: { createTask },
    });

    await service.trigger("prompt-automation");

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ target: explicitTarget }),
      expect.any(Number),
      undefined,
      explicitTarget,
      false,
    );
  });

  it("refs the parked task's id when createTask holds/queues/defers instead of dispatching", async () => {
    const createTask = vi.fn(async () => ({
      outcome: "scheduled" as const,
      task: { id: "task_3" },
    }));
    const { service } = makeService({
      automation: taskAutomation(),
      taskScheduler: { createTask },
    });

    expect(await service.trigger("prompt-automation")).toBe("task_3");
  });
});

describe("SchedulerService — dispatch (F4c: self-knowledge target)", () => {
  it("calls check() then write(), refs `self-knowledge:refreshed` when drift was found", async () => {
    const check = vi.fn(async () => true);
    const write = vi.fn(async () => ({}));
    const { service } = makeService({
      automation: selfKnowledgeAutomation(),
      selfKnowledge: { check, write },
    });

    const ref = await service.trigger("self-knowledge-refresh");

    expect(check).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(ref).toBe("self-knowledge:refreshed");
  });

  it("refs `self-knowledge:clean` when no drift was found", async () => {
    const { service } = makeService({
      automation: selfKnowledgeAutomation(),
      selfKnowledge: { check: vi.fn(async () => false), write: vi.fn() },
    });

    expect(await service.trigger("self-knowledge-refresh")).toBe("self-knowledge:clean");
  });

  it("a throwing self-knowledge service refs `self-knowledge:error`, the tick survives (fail-open)", async () => {
    const { service } = makeService({
      automation: selfKnowledgeAutomation(),
      selfKnowledge: {
        check: vi.fn(async () => {
          throw new Error("vault hiccup");
        }),
        write: vi.fn(),
      },
    });

    await expect(service.trigger("self-knowledge-refresh")).resolves.toBe("self-knowledge:error");
  });
});

describe("SchedulerService — T7 TickingWatcherBase adoption", () => {
  it("two rapid timer-driven firings run tick() once (skip-if-in-flight guard)", async () => {
    const { service } = makeService({ automation: agentFactoryAutomation() });
    let resolveFirst: () => void = () => {};
    const deferred = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const tickSpy = vi.spyOn(service, "tick").mockImplementation(async () => {
      await deferred;
      return [];
    });
    // `tick()` itself stays public/unguarded (every other test in this file calls
    // it via `trigger()`/directly); the guard sits only on the timer-driven path.
    const guardedTick = () =>
      (service as unknown as { guardedTick(): Promise<void> }).guardedTick();

    const first = guardedTick();
    const second = guardedTick();
    await second; // skipped — resolves without waiting on the first
    expect(tickSpy).toHaveBeenCalledTimes(1);

    resolveFirst();
    await first;
    expect(tickSpy).toHaveBeenCalledTimes(1); // still once
  });

  it('health()\'s `running` still means "timer armed", unaffected by the in-flight guard', () => {
    const { service } = makeService({ automation: agentFactoryAutomation() });
    // No `onModuleInit()` here (systemConfig defaults tickMs to 0 in tests) — the
    // timer is never armed, so `running` stays false regardless of any in-flight tick.
    expect(service.health().running).toBe(false);
  });
});
