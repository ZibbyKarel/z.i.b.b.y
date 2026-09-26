import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ChainInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { ChainInUseError, ChainNotFoundError, InvalidChainInputError } from "./chain.errors";
import { ChainsService } from "./chains.service";
import { HandoffRuleStore } from "./handoff-rule.store";
import { HandoffSignalKindStore } from "./handoff-signal-kind.store";

const fakeLogger = {
  child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
};

const CHAIN_INPUT: ChainInput = {
  label: "Test chain",
  description: "A test chain.",
  entry: "rnd",
  steps: [
    { department: "dev", gate: "auto" },
    { department: "rel", gate: "ask" },
  ],
  enabled: true,
};

describe("ChainsService", () => {
  let dir: string;
  let signalKinds: HandoffSignalKindStore;
  let rules: HandoffRuleStore;
  let tasks: ScheduledTasksStorageService;
  let service: ChainsService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-service-"));
    signalKinds = new HandoffSignalKindStore(
      path.join(dir, "signal-kinds.json"),
      fakeLogger as never,
    );
    rules = new HandoffRuleStore(path.join(dir, "rules.json"), fakeLogger as never);
    await signalKinds.onModuleInit();
    await rules.onModuleInit();
    tasks = new ScheduledTasksStorageService(path.join(dir, "tasks"));
    service = new ChainsService(signalKinds, rules, tasks, fakeLogger as never);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("put creates a chain: the kind and its rules are both written", async () => {
    const chain = await service.put("c1", CHAIN_INPUT);
    expect(chain).toEqual({
      id: "c1",
      label: "Test chain",
      description: "A test chain.",
      entry: "rnd",
      steps: [
        { department: "dev", gate: "auto", ruleId: "c1:0" },
        { department: "rel", gate: "ask", ruleId: "c1:1" },
      ],
      enabled: true,
    });
    const persistedRules = await rules.rulesForSignalKind("c1");
    expect(persistedRules).toHaveLength(2);
  });

  it("rejects an invalid input with InvalidChainInputError, writing nothing", async () => {
    const invalid: ChainInput = {
      ...CHAIN_INPUT,
      steps: [
        { department: "dev", gate: "auto" },
        { department: "rnd", gate: "ask" }, // cycles back to entry
      ],
    };
    await expect(service.put("c1", invalid)).rejects.toThrow(InvalidChainInputError);
    await expect(service.get("c1")).rejects.toThrow(ChainNotFoundError);
  });

  it("put replaces exactly the same chain's rules on a re-PUT, leaving other rules untouched", async () => {
    await service.put("c1", CHAIN_INPUT);
    const otherRule = await rules.create({
      from: "inc",
      signalKind: "ask-dev",
      to: { kind: "department", id: "dev" },
      tier: 3,
      enabled: true,
    });
    await service.put("c1", { ...CHAIN_INPUT, steps: [{ department: "dev", gate: "ask" }] });
    const persistedRules = await rules.rulesForSignalKind("c1");
    expect(persistedRules).toHaveLength(1);
    expect(persistedRules[0]?.tier).toBe(3);
    const allRules = await rules.list();
    expect(allRules.find((r) => r.id === otherRule.id)).toBeDefined();
  });

  it("put rolls the kind back to its previous value when the rules write fails", async () => {
    await service.put("c1", CHAIN_INPUT);
    const before = await service.get("c1");
    const failingRules = {
      replaceForSignalKind: vi.fn(async () => {
        throw new Error("disk full");
      }),
    };
    const rollbackService = new ChainsService(
      signalKinds,
      failingRules as never,
      tasks,
      fakeLogger as never,
    );
    await expect(rollbackService.put("c1", { ...CHAIN_INPUT, label: "Changed" })).rejects.toThrow(
      "disk full",
    );
    const after = await service.get("c1");
    expect(after).toEqual(before);
  });

  it("put rolls a brand-new chain's kind back (deletes it) when the rules write fails", async () => {
    const failingRules = {
      replaceForSignalKind: vi.fn(async () => {
        throw new Error("disk full");
      }),
    };
    const rollbackService = new ChainsService(
      signalKinds,
      failingRules as never,
      tasks,
      fakeLogger as never,
    );
    await expect(rollbackService.put("new-chain", CHAIN_INPUT)).rejects.toThrow("disk full");
    await expect(service.get("new-chain")).rejects.toThrow(ChainNotFoundError);
  });

  it("get on an unknown id throws ChainNotFoundError", async () => {
    await expect(service.get("does-not-exist")).rejects.toThrow(ChainNotFoundError);
  });

  it("list returns only chain kinds, derived", async () => {
    await service.put("c1", CHAIN_INPUT);
    const chains = await service.list();
    expect(chains.map((c) => c.id)).toEqual(["c1"]);
  });

  it("delete removes both the kind and its rules", async () => {
    await service.put("c1", CHAIN_INPUT);
    await service.delete("c1");
    await expect(service.get("c1")).rejects.toThrow(ChainNotFoundError);
    expect(await rules.rulesForSignalKind("c1")).toHaveLength(0);
  });

  it("delete on an unknown id throws ChainNotFoundError", async () => {
    await expect(service.delete("does-not-exist")).rejects.toThrow(ChainNotFoundError);
  });

  it("delete refuses with ChainInUseError while a non-terminal parent task references the chain", async () => {
    await service.put("c1", CHAIN_INPUT);
    await tasks.createChainParent(
      tasks.newId(),
      { title: "t", text: "t", target: { kind: "chain", id: "c1", name: "Test chain" } },
      undefined,
      Date.now(),
      { kind: "chain", id: "c1", name: "Test chain" },
    );
    await expect(service.delete("c1")).rejects.toThrow(ChainInUseError);
    // still intact after the refusal
    await expect(service.get("c1")).resolves.toBeDefined();
  });

  it("delete succeeds once the referencing parent has ended", async () => {
    await service.put("c1", CHAIN_INPUT);
    const parent = await tasks.createChainParent(
      tasks.newId(),
      { title: "t", text: "t", target: { kind: "chain", id: "c1", name: "Test chain" } },
      undefined,
      Date.now(),
      { kind: "chain", id: "c1", name: "Test chain" },
    );
    await tasks.markChainEnded(parent.id);
    await expect(service.delete("c1")).resolves.toBeUndefined();
  });
});
