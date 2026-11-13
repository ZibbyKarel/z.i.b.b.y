import type { Automation, Signal } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AutomationFiresStore } from "./automation-fires.store";
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

function workflowAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "nightly-workflow",
    name: "Nightly workflow",
    trigger: { type: "cron", expr: "0 3 * * *" },
    target: { type: "workflow", workflowId: "release" },
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

function securityScanAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "security-scan",
    name: "Bezpečnostní hlídka",
    trigger: { type: "cron", expr: "0 5 * * 1" },
    target: { type: "security-scan" },
    enabled: true,
    system: true,
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

function archAuditAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "arch-audit",
    name: "Noční audit kvality",
    trigger: { type: "cron", expr: "0 2 * * *" },
    target: { type: "arch-audit" },
    enabled: true,
    system: true,
    ...over,
  };
}

function reviewLearnAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "review-learn",
    name: "Učení z review",
    trigger: { type: "cron", expr: "15 3 * * *" },
    target: { type: "review-learn" },
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
  taskScheduler?: { createTask: ReturnType<typeof vi.fn> };
  selfKnowledge?: { check: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  security?: { scan: ReturnType<typeof vi.fn> };
  arch?: { audit: ReturnType<typeof vi.fn> };
  reviewLearning?: { learn: ReturnType<typeof vi.fn> };
  externalSkills?: { syncAll: ReturnType<typeof vi.fn> };
  gaps?: { detect: ReturnType<typeof vi.fn> };
  slackDigest?: { run: ReturnType<typeof vi.fn> };
  fires?: AutomationFiresStore;
}): {
  service: SchedulerService;
  storage: { markFired: ReturnType<typeof vi.fn> };
  /** The dispatcher the service registered on the signal bus (after `onModuleInit`). */
  registered: () => ((automation: Automation, signal: Signal) => Promise<string>) | undefined;
} {
  let registered: ((automation: Automation, signal: Signal) => Promise<string>) | undefined;
  const storage = {
    list: async () => [opts.automation],
    get: async (id: string) => {
      if (id !== opts.automation.id) throw new Error("not found");
      return opts.automation;
    },
    markFired: vi.fn(async () => opts.automation),
  };
  const service = new SchedulerService(
    storage as never,
    fakeLogger as never,
    fakeTrace as never,
    { generate: vi.fn() } as never,
    { distill: vi.fn() } as never,
    { extract: vi.fn() } as never,
    (opts.gaps ?? { detect: vi.fn() }) as never,
    fakeSystemConfigStore(),
    { detect: opts.detect ?? vi.fn() } as never,
    (opts.taskScheduler ?? { createTask: vi.fn() }) as never,
    (opts.selfKnowledge ?? { check: vi.fn(async () => false), write: vi.fn() }) as never,
    (opts.security ?? { scan: vi.fn(async () => ({ findings: [] })) }) as never,
    (opts.arch ?? { audit: vi.fn(async () => ({ findings: [] })) }) as never,
    // F6c watcher-health registry double — registration is exercised in the
    // base/e2e specs, not here.
    { register: () => {} } as never,
    (opts.reviewLearning ?? {
      learn: vi.fn(async () => ({ observations: 0, proposed: 0 })),
    }) as never,
    // Signal bus double — captures the dispatcher the scheduler registers on init.
    {
      registerDispatcher: (fn: typeof registered) => {
        registered = fn;
      },
    } as never,
    { run: vi.fn(async () => ({ brokenLinks: 0, orphans: 0, stale: 0 })) } as never,
    (opts.externalSkills ?? {
      syncAll: vi.fn(async () => ({ checked: 0, updated: [], failed: [] })),
    }) as never,
    (opts.fires ?? {
      begin: vi.fn(async () => Promise.reject(new Error("no store"))),
      reconcile: vi.fn(async () => {}),
    }) as never,
    (opts.slackDigest ?? { run: vi.fn(async () => "slack-digest:empty") }) as never,
  );
  return { service, storage, registered: () => registered };
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

describe("SchedulerService — dispatch (agent / workflow targets ride the task scheduler)", () => {
  const dispatched = (runRef: string) =>
    vi.fn(async () => ({ outcome: "dispatched" as const, runRef, task: { id: "task_w" } }));

  it("fires a workflow automation through createTask with an explicit target and the prompt as text", async () => {
    const createTask = dispatched("release_1");
    const { service } = makeService({
      automation: workflowAutomation({ prompt: "focus on regressions" }),
      taskScheduler: { createTask },
    });

    const ref = await service.trigger("nightly-workflow");

    const explicit = { kind: "workflow", id: "release", name: "release" };
    expect(createTask).toHaveBeenCalledWith(
      {
        text: "focus on regressions",
        target: explicit,
        source: "automation",
        automationId: "nightly-workflow",
      },
      expect.any(Number),
      undefined,
      explicit,
      false,
    );
    expect(ref).toBe("release_1");
  });

  it("an empty prompt becomes empty task text (no behaviour change for prompt-less automations)", async () => {
    const createTask = dispatched("release_2");
    const { service } = makeService({
      automation: workflowAutomation(),
      taskScheduler: { createTask },
    });

    await service.trigger("nightly-workflow");

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ text: "" }),
      expect.any(Number),
      undefined,
      { kind: "workflow", id: "release", name: "release" },
      false,
    );
  });

  it("fires an agent automation through createTask with a {kind: agent} target", async () => {
    const createTask = dispatched("writer_1_1");
    const { service } = makeService({
      automation: workflowAutomation({
        id: "nightly-agent",
        target: { type: "agent", agentId: "writer" },
        prompt: "tidy the docs",
      }),
      taskScheduler: { createTask },
    });

    const ref = await service.trigger("nightly-agent");

    const explicit = { kind: "agent", id: "writer", name: "writer" };
    expect(createTask).toHaveBeenCalledWith(
      {
        text: "tidy the docs",
        target: explicit,
        source: "automation",
        automationId: "nightly-agent",
      },
      expect.any(Number),
      undefined,
      explicit,
      false,
    );
    expect(ref).toBe("writer_1_1");
  });

  it("refs the parked task's id when the run slots are full and the task queues", async () => {
    const createTask = vi.fn(async () => ({
      outcome: "scheduled" as const,
      task: { id: "task_q", status: "queued" },
    }));
    const { service } = makeService({
      automation: workflowAutomation(),
      taskScheduler: { createTask },
    });

    expect(await service.trigger("nightly-workflow")).toBe("task_q");
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
        source: "automation",
        automationId: "prompt-automation",
      },
      expect.any(Number),
      undefined,
      undefined,
      false,
    );
    expect(ref).toBe("writer_1_1");
  });

  it("a signal dispatch appends the signal's title+body to the task text and passes its project", async () => {
    const createTask = vi.fn(async () => ({
      outcome: "dispatched" as const,
      runRef: "dev_1",
      target: { kind: "department" as const, id: "dev", name: "dev" },
      task: { id: "task_3" },
    }));
    const { service, registered } = makeService({
      automation: taskAutomation({ target: { type: "task", text: "fix it" } }),
      taskScheduler: { createTask },
    });
    service.onModuleInit();
    const dispatch = registered();
    expect(dispatch).toBeDefined();

    const ref = await dispatch?.(taskAutomation({ target: { type: "task", text: "fix it" } }), {
      from: "sec",
      kind: "cve",
      title: "CVE in foo",
      body: "details",
      fingerprint: "fp",
      projectId: "acme",
    });

    expect(ref).toBe("dev_1");
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ text: "fix it\n\nCVE in foo\n\ndetails", title: "CVE in foo" }),
      expect.any(Number),
      "acme",
      undefined,
      false,
    );
    service.onModuleDestroy();
  });

  it("forwards an explicit @-mentioned target and bypasses classification", async () => {
    const explicitTarget = { kind: "workflow" as const, id: "code-audit", name: "Code audit" };
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

describe("SchedulerService — dispatch (NS2 F5a: security-scan target)", () => {
  it("dispatches straight to SecurityService.scan and refs the finding count", async () => {
    const scan = vi.fn(async () => ({ findings: [{ kind: "cve" }, { kind: "secret" }] }));
    const { service } = makeService({ automation: securityScanAutomation(), security: { scan } });

    const ref = await service.trigger("security-scan");

    expect(scan).toHaveBeenCalledTimes(1);
    expect(ref).toBe("security:2");
  });

  it("refs a zero count on a green (no-findings) scan", async () => {
    const { service } = makeService({ automation: securityScanAutomation() });
    expect(await service.trigger("security-scan")).toBe("security:0");
  });
});

describe("SchedulerService — dispatch (external-skills-sync target)", () => {
  it("scheduler dispatches external-skills-sync to syncAll", async () => {
    const syncAll = vi.fn(async () => ({ checked: 3, updated: ["a", "b"], failed: ["c"] }));
    const { service } = makeService({
      automation: {
        id: "external-deps-update",
        name: "Aktualizace externích závislostí",
        trigger: { type: "cron", expr: "0 4 * * 1" },
        target: { type: "external-skills-sync" },
        enabled: true,
        system: true,
      },
      externalSkills: { syncAll },
    });

    expect(await service.trigger("external-deps-update")).toBe("external-skills:2");
    expect(syncAll).toHaveBeenCalledTimes(1);
  });
});

describe("SchedulerService — dispatch (NS2 F5c: arch-audit target)", () => {
  it("dispatches straight to ArchService.audit and refs the finding count", async () => {
    const audit = vi.fn(async () => ({ findings: [{ kind: "god-node" }, { kind: "cycle" }] }));
    const { service } = makeService({ automation: archAuditAutomation(), arch: { audit } });

    const ref = await service.trigger("arch-audit");

    expect(audit).toHaveBeenCalledTimes(1);
    expect(ref).toBe("arch:2");
  });

  it("refs a zero count on a green (no-findings) audit", async () => {
    const { service } = makeService({ automation: archAuditAutomation() });
    expect(await service.trigger("arch-audit")).toBe("arch:0");
  });
});

describe("SchedulerService — dispatch (PR review learning v1: review-learn target)", () => {
  it("dispatches the review-learn system automation to the review learner", async () => {
    const learn = vi.fn(async () => ({ observations: 3, proposed: 1 }));
    const { service } = makeService({
      automation: reviewLearnAutomation(),
      reviewLearning: { learn },
    });

    const ref = await service.trigger("review-learn");

    expect(learn).toHaveBeenCalledTimes(1);
    expect(ref).toBe("review-rules:3");
  });

  it("refs a zero count when nothing new was observed", async () => {
    const { service } = makeService({ automation: reviewLearnAutomation() });
    expect(await service.trigger("review-learn")).toBe("review-rules:0");
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

describe("SchedulerService — every fire is recorded (todo-4)", () => {
  let dir: string;
  let fires: AutomationFiresStore;
  const gapAutomation = (over: Partial<Automation> = {}): Automation => ({
    id: "gap-detect",
    trigger: { type: "cron", expr: "* * * * *" },
    target: { type: "gap-detect" },
    prompt: "look for gaps",
    enabled: true,
    system: true,
    ...over,
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "scheduler-fires-"));
    fires = new AutomationFiresStore(dir);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const logOf = async (automationId: string, fireId: string) =>
    (await fires.readLog(automationId, fireId, 0)).content;

  it("records a manual in-process fire as done with its result ref and a log", async () => {
    const detect = vi.fn(async () => ({ suggestions: [1, 2] }));
    const { service } = makeService({ automation: gapAutomation(), gaps: { detect }, fires });

    expect(await service.trigger("gap-detect")).toBe("gaps:2");

    const [fire, ...rest] = await fires.list("gap-detect");
    expect(rest).toHaveLength(0);
    expect(fire).toMatchObject({ source: "manual", status: "done", result: "gaps:2" });
    expect(fire?.durationMs).toBeGreaterThanOrEqual(0);
    const log = await logOf("gap-detect", fire?.id ?? "");
    expect(log).toContain("start target=gap-detect prompt=look for gaps");
    expect(log).toContain("gaps:2");
  });

  it("records a throwing handler as error (message + stack in the log) and still rejects", async () => {
    const detect = vi.fn(async () => {
      throw new Error("vault offline");
    });
    const { service } = makeService({ automation: gapAutomation(), gaps: { detect }, fires });

    await expect(service.trigger("gap-detect")).rejects.toThrow("vault offline");

    const fire = await fires.latest("gap-detect");
    expect(fire).toMatchObject({ status: "error", error: "vault offline" });
    const log = await logOf("gap-detect", fire?.id ?? "");
    expect(log).toContain("error: vault offline");
    expect(log).toContain("scheduler.service.test.ts");
  });

  it("records a task target's runRef", async () => {
    const createTask = vi.fn(async () => ({
      outcome: "dispatched" as const,
      runRef: "run_42",
      task: { id: "task_1" },
    }));
    const { service } = makeService({
      automation: taskAutomation(),
      taskScheduler: { createTask },
      fires,
    });

    await service.trigger("prompt-automation");

    expect(await fires.latest("prompt-automation")).toMatchObject({
      status: "done",
      runRef: "run_42",
    });
  });

  it("records a cron tick fire with source cron", async () => {
    const detect = vi.fn(async () => ({ suggestions: [] }));
    const { service } = makeService({ automation: gapAutomation(), gaps: { detect }, fires });

    expect(await service.tick(new Date("2026-11-12T08:00:00Z"))).toEqual(["gap-detect"]);

    expect(await fires.latest("gap-detect")).toMatchObject({ source: "cron", result: "gaps:0" });
  });

  it("records a signal dispatch with source signal", async () => {
    const detect = vi.fn(async () => ({ suggestions: [] }));
    const { service, registered } = makeService({
      automation: gapAutomation(),
      gaps: { detect },
      fires,
    });
    service.onModuleInit();

    const signal: Signal = {
      from: "security",
      kind: "cve",
      title: "CVE",
      body: "x",
      fingerprint: "f1",
    };
    await registered()?.(gapAutomation(), signal);

    expect(await fires.latest("gap-detect")).toMatchObject({ source: "signal" });
    service.onModuleDestroy();
  });

  it("still dispatches when the store itself fails", async () => {
    const detect = vi.fn(async () => ({ suggestions: [] }));
    const { service } = makeService({ automation: gapAutomation(), gaps: { detect } });

    expect(await service.trigger("gap-detect")).toBe("gaps:0");
  });

  it("records no runRef when a task is only queued (the ref is a task id)", async () => {
    const createTask = vi.fn(async () => ({
      outcome: "scheduled" as const,
      task: { id: "task_9" },
    }));
    const { service } = makeService({
      automation: taskAutomation(),
      taskScheduler: { createTask },
      fires,
    });

    expect(await service.trigger("prompt-automation")).toBe("task_9");

    const fire = await fires.latest("prompt-automation");
    expect(fire).toMatchObject({ status: "done", result: "task_9" });
    expect(fire).not.toHaveProperty("runRef");
  });

  it("logs a failure's message once, followed by the stack frames", async () => {
    const detect = vi.fn(async () => {
      throw new Error("vault offline");
    });
    const { service } = makeService({ automation: gapAutomation(), gaps: { detect }, fires });

    await expect(service.trigger("gap-detect")).rejects.toThrow();

    const log = await logOf("gap-detect", (await fires.latest("gap-detect"))?.id ?? "");
    expect(log.match(/vault offline/g)).toHaveLength(1);
    expect(log).toMatch(/error: vault offline\n\s+at /);
  });

  it("records two overlapping triggers as distinct fires; the newest start wins lastFire", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const detect = vi
      .fn()
      .mockImplementationOnce(async () => {
        await gate;
        return { suggestions: [1] };
      })
      .mockImplementationOnce(async () => ({ suggestions: [1, 2] }));
    const { service } = makeService({ automation: gapAutomation(), gaps: { detect }, fires });

    const first = service.trigger("gap-detect");
    await vi.waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 5));
    const second = service.trigger("gap-detect");
    await second;
    release();
    await first;

    const all = await fires.list("gap-detect");
    expect(all).toHaveLength(2);
    expect(new Set(all.map((f) => f.id)).size).toBe(2);
    expect(await fires.latest("gap-detect")).toMatchObject({ result: "gaps:2" });
  });

  it("reconciles interrupted fires on init", async () => {
    const stuck = await fires.begin("gap-detect", "cron");
    const { service } = makeService({ automation: gapAutomation(), fires });
    await service.onModuleInit();
    service.onModuleDestroy();
    expect(await fires.latest("gap-detect")).toMatchObject({
      id: stuck.id,
      status: "error",
      error: "interrupted (process restart)",
    });
  });
});

describe("SchedulerService — dispatch (slack-digest case)", () => {
  const automation = (): Automation => ({
    id: "slack-digest",
    name: "Denní souhrn Slacku",
    trigger: { type: "cron", expr: "0 22 * * *" },
    target: { type: "slack-digest" },
    enabled: true,
    system: true,
  });

  it("dispatches to SlackDigestService.run and returns its ref", async () => {
    const run = vi.fn(async () => "slack-digest:slack-2026-11-13");
    const { service } = makeService({ automation: automation(), slackDigest: { run } });
    expect(await service.trigger("slack-digest")).toBe("slack-digest:slack-2026-11-13");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("is fail-open when the service throws", async () => {
    const run = vi.fn(async () => {
      throw new Error("boom");
    });
    const { service } = makeService({ automation: automation(), slackDigest: { run } });
    expect(await service.trigger("slack-digest")).toBe("slack-digest:error");
  });
});
