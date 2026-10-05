import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Automation, Signal } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalBusService } from "./signal-bus.service";
import { SignalBusStore } from "./signal-bus.store";

const fakeLogger = {
  child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
};

function automation(over: Partial<Automation> = {}): Automation {
  return {
    id: "sig-a",
    trigger: { type: "signal", kind: "cve", from: "sec", minSeverity: "critical" },
    target: { type: "task", text: "fix it" },
    enabled: true,
    system: false,
    ...over,
  };
}

const signal: Signal = {
  from: "sec",
  kind: "cve",
  severity: "critical",
  title: "CVE in foo",
  body: "details",
  fingerprint: "fp-1",
};

describe("SignalBusService", () => {
  let dir: string;
  let automations: Automation[];
  let dispatch: ReturnType<typeof vi.fn>;
  let approvals: { register: ReturnType<typeof vi.fn>; requestApproval: ReturnType<typeof vi.fn> };
  let bus: SignalBusService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "signal-bus-"));
    automations = [automation()];
    dispatch = vi.fn(async () => "task_1");
    approvals = { register: vi.fn(), requestApproval: vi.fn(async () => ({ id: "appr_1" })) };
    bus = new SignalBusService(
      {
        list: async () => automations,
        get: async (id: string) => automations.find((a) => a.id === id) as Automation,
        markFired: vi.fn(async () => undefined),
      } as never,
      new SignalBusStore(dir, fakeLogger as never),
      approvals as never,
      { record: vi.fn(async () => undefined) } as never,
      fakeLogger as never,
    );
    bus.registerDispatcher(dispatch);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("dispatches a matching automation once per fingerprint and returns its runRef", async () => {
    expect(await bus.emit(signal)).toEqual({ runRefs: ["task_1"] });
    expect(dispatch).toHaveBeenCalledWith(automations[0], signal);
    expect(await bus.emit(signal)).toEqual({ runRefs: [] });
    expect(dispatch).toHaveBeenCalledTimes(1);
    await bus.emit({ ...signal, fingerprint: "fp-2" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("gates on kind, department, severity and enabled; a severity-less signal passes; '*' matches any kind", async () => {
    await bus.emit({ ...signal, fingerprint: "a", kind: "secret" });
    await bus.emit({ ...signal, fingerprint: "b", from: "rel" });
    await bus.emit({ ...signal, fingerprint: "c", severity: "high" });
    expect(dispatch).not.toHaveBeenCalled();
    await bus.emit({ ...signal, fingerprint: "d", severity: undefined });
    expect(dispatch).toHaveBeenCalledTimes(1);

    automations = [automation({ trigger: { type: "signal", kind: "*" } })];
    await bus.emit({ ...signal, fingerprint: "e", kind: "anything" });
    expect(dispatch).toHaveBeenCalledTimes(2);

    automations = [automation({ enabled: false })];
    await bus.emit({ ...signal, fingerprint: "f" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("approval: ask parks an automation-dispatch approval; approving dispatches, rejecting does not", async () => {
    automations = [automation({ approval: "ask" })];
    expect(await bus.emit(signal)).toEqual({ runRefs: [] });
    expect(dispatch).not.toHaveBeenCalled();
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "automation-dispatch", risk: "medium" }),
    );
    const [parked] = approvals.requestApproval.mock.calls[0] as [{ runId: string; detail: string }];
    // The approval carries the signal's full body and what approving starts.
    expect(JSON.parse(parked.detail)).toMatchObject({
      consequence: expect.stringContaining("Po schválení"),
      preview: { kind: "message", body: signal.body },
    });
    const pendingId = parked.runId;

    await bus.resume(pendingId);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // a second parked one, rejected
    await bus.emit({ ...signal, fingerprint: "fp-9" });
    const second = (approvals.requestApproval.mock.calls[1] as [{ runId: string }])[0].runId;
    bus.cancel(second);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await bus.resume(second);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("never throws: a failing dispatcher is swallowed", async () => {
    dispatch.mockRejectedValue(new Error("boom"));
    await expect(bus.emit(signal)).resolves.toEqual({ runRefs: [] });
  });
});
