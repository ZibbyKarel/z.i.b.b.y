import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
