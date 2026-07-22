import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HandoffFiredStore } from "./handoff-fired.store";

const fakeLogger = {
  child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
};

describe("HandoffFiredStore", () => {
  let dir: string;
  let store: HandoffFiredStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-fired-"));
    store = new HandoffFiredStore(dir, fakeLogger as never);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("a never-seen (ruleId, fingerprint) has not fired", async () => {
    expect(await store.hasFired("rule-a", "fp-1")).toBe(false);
  });

  it("markFired then hasFired is idempotent and scoped per ruleId", async () => {
    await store.markFired("rule-a", "fp-1");
    expect(await store.hasFired("rule-a", "fp-1")).toBe(true);
    expect(await store.hasFired("rule-a", "fp-2")).toBe(false);
    expect(await store.hasFired("rule-b", "fp-1")).toBe(false);
    // Idempotent re-mark doesn't throw or duplicate.
    await store.markFired("rule-a", "fp-1");
    expect(await store.hasFired("rule-a", "fp-1")).toBe(true);
  });

  it("fails open on a corrupt snapshot file — reads as never-fired", async () => {
    await fs.writeFile(path.join(dir, "rule-a.json"), "not json{{{");
    expect(await store.hasFired("rule-a", "fp-1")).toBe(false);
  });
});
