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

/** Build a SchedulerService with every non-agent-factory dependency stubbed to a
 * no-op — this suite only exercises the `agent-factory` case of the dispatch switch. */
function makeService(opts: {
  automation: Automation;
  detect: ReturnType<typeof vi.fn>;
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
    noRunner as never,
    fakeLogger as never,
    fakeTrace as never,
    { generate: vi.fn() } as never,
    { run: vi.fn() } as never,
    { distill: vi.fn() } as never,
    { extract: vi.fn() } as never,
    { refresh: vi.fn() } as never,
    { detect: vi.fn() } as never,
    { generate: vi.fn() } as never,
    fakeSystemConfigStore(),
    { detect: opts.detect } as never,
  );
  return { service, storage };
}

describe("SchedulerService — dispatch (Phase 4b: agent-factory case)", () => {
  it("dispatches the agent-factory target straight to AgentFactoryService.detect and refs the count", async () => {
    const detect = vi.fn(async () => ({ proposed: ["auto-deploy-staging", "auto-fix-flaky-test"] }));
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
