import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HandoffRuleInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HandoffRuleNotFoundError, SystemHandoffRuleError } from "./handoff-rule.errors";
import { HandoffRuleStore, SYSTEM_HANDOFF_RULES } from "./handoff-rule.store";

const fakeLogger = {
  child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
};

describe("HandoffRuleStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-rules-"));
    file = path.join(dir, "nested", "rules.json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("seeds the 4 system rules on an empty/missing dir", async () => {
    const store = new HandoffRuleStore(file, fakeLogger as never);
    await store.onModuleInit();
    const rules = await store.list();
    expect(rules).toHaveLength(4);
    expect(rules.map((r) => r.id).sort()).toEqual(
      [...SYSTEM_HANDOFF_RULES].map((r) => r.id).sort(),
    );
    expect(rules.every((r) => r.system)).toBe(true);
  });

  it("re-seeds the system defaults when the file is corrupt", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not valid json{{{");
    const store = new HandoffRuleStore(file, fakeLogger as never);
    await store.onModuleInit();
    const rules = await store.list();
    expect(rules).toHaveLength(4);
  });

  it("leaves a valid, pre-existing file untouched", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const custom = [
      {
        id: "custom-rule",
        from: "loom",
        signalKind: "*",
        to: { kind: "subsystem", id: "forge" },
        tier: 3,
        enabled: true,
      },
    ];
    await fs.writeFile(file, JSON.stringify(custom));
    const store = new HandoffRuleStore(file, fakeLogger as never);
    await store.onModuleInit();
    const rules = await store.list();
    expect(rules).toEqual(custom);
  });

  it("list() reads an empty array back for a still-missing file (no crash)", async () => {
    const store = new HandoffRuleStore(file, fakeLogger as never);
    // Deliberately not calling onModuleInit — exercise list()'s own fail-open path.
    const rules = await store.list();
    expect(rules).toEqual([]);
  });

  describe("create/update/delete", () => {
    const USER_INPUT: HandoffRuleInput = {
      from: "beacon",
      signalKind: "ask-forge",
      to: { kind: "subsystem", id: "forge" },
      tier: 3,
      enabled: true,
    };

    it("create mints an id and forces system:false even if the input passes system:true", async () => {
      const store = new HandoffRuleStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create({ ...USER_INPUT, system: true });
      expect(created.id).toBeTruthy();
      expect(created.system).toBe(false);
      const rules = await store.list();
      expect(rules).toContainEqual(created);
      expect(rules).toHaveLength(5);
    });

    it("update on a user rule changes its editable fields", async () => {
      const store = new HandoffRuleStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create(USER_INPUT);
      const updated = await store.update(created.id, { ...USER_INPUT, tier: 2, enabled: false });
      expect(updated.id).toBe(created.id);
      expect(updated.tier).toBe(2);
      expect(updated.enabled).toBe(false);
      expect(updated.system).toBe(false);
    });

    it("update on a SYSTEM rule can retune tier/enabled but the rule stays system:true", async () => {
      const store = new HandoffRuleStore(file, fakeLogger as never);
      await store.onModuleInit();
      const systemRule = SYSTEM_HANDOFF_RULES[0];
      if (!systemRule) throw new Error("expected at least one seeded system rule");
      const updated = await store.update(systemRule.id, {
        from: systemRule.from,
        signalKind: systemRule.signalKind,
        minSeverity: systemRule.minSeverity,
        to: systemRule.to,
        tier: 1,
        enabled: false,
        system: false, // an attempt to demote it is ignored
      });
      expect(updated.tier).toBe(1);
      expect(updated.enabled).toBe(false);
      expect(updated.system).toBe(true);
    });

    it("delete on a user rule removes it", async () => {
      const store = new HandoffRuleStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create(USER_INPUT);
      await store.delete(created.id);
      const rules = await store.list();
      expect(rules.find((r) => r.id === created.id)).toBeUndefined();
      expect(rules).toHaveLength(4);
    });

    it("delete on a SYSTEM rule throws SystemHandoffRuleError", async () => {
      const store = new HandoffRuleStore(file, fakeLogger as never);
      await store.onModuleInit();
      const systemRule = SYSTEM_HANDOFF_RULES[0];
      if (!systemRule) throw new Error("expected at least one seeded system rule");
      await expect(store.delete(systemRule.id)).rejects.toThrow(SystemHandoffRuleError);
      const rules = await store.list();
      expect(rules.find((r) => r.id === systemRule.id)).toBeDefined();
    });

    it("update of an unknown id throws HandoffRuleNotFoundError", async () => {
      const store = new HandoffRuleStore(file, fakeLogger as never);
      await store.onModuleInit();
      await expect(store.update("does-not-exist", USER_INPUT)).rejects.toThrow(
        HandoffRuleNotFoundError,
      );
    });

    it("delete of an unknown id throws HandoffRuleNotFoundError", async () => {
      const store = new HandoffRuleStore(file, fakeLogger as never);
      await store.onModuleInit();
      await expect(store.delete("does-not-exist")).rejects.toThrow(HandoffRuleNotFoundError);
    });
  });
});
