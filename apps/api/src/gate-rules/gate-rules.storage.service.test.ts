import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { GlobalGateRuleInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GateRuleNotFoundError } from "./gate-rules.errors";
import { GateRulesStorageService } from "./gate-rules.storage.service";

describe("GateRulesStorageService", () => {
  let dir: string;
  let store: GateRulesStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "gate-rules-"));
    store = new GateRulesStorageService(dir);
    await store.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const allowRule: GlobalGateRuleInput = {
    name: "Test allow",
    match: [{ type: "tool", tool: "read" }],
    decision: "allow",
  };

  it("seeds a non-empty default catalog on first run", async () => {
    const rules = await store.list();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.id === "gr-merge")).toBe(true);
  });

  it("appends a created rule with a fresh id, in order", async () => {
    const before = await store.list();
    const created = await store.create(allowRule);
    expect(created.id).toMatch(/^gr_/);
    const after = await store.list();
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)?.id).toBe(created.id);
  });

  it("updates a rule in place, keeping its id and position", async () => {
    const created = await store.create(allowRule);
    const updated = await store.update(created.id, { ...allowRule, decision: "deny" });
    expect(updated.id).toBe(created.id);
    expect(updated.decision).toBe("deny");
  });

  it("throws on update/remove of an unknown id", async () => {
    await expect(store.update("missing", allowRule)).rejects.toBeInstanceOf(GateRuleNotFoundError);
    await expect(store.remove("missing")).rejects.toBeInstanceOf(GateRuleNotFoundError);
  });

  it("reorders by a full id permutation and rejects a partial list", async () => {
    const rules = await store.list();
    const reversed = [...rules].reverse().map((r) => r.id);
    const result = await store.reorder(reversed);
    expect(result?.map((r) => r.id)).toEqual(reversed);
    // a list that is not a permutation of the catalog is rejected
    expect(await store.reorder([reversed[0]!])).toBeNull();
    expect(await store.reorder([...reversed, "extra"])).toBeNull();
  });

  it("persists across instances pointed at the same dir", async () => {
    const created = await store.create(allowRule);
    const reopened = new GateRulesStorageService(dir);
    const rules = await reopened.list();
    expect(rules.some((r) => r.id === created.id)).toBe(true);
  });
});
