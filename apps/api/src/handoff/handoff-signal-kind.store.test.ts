import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HandoffSignalKindInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignalKindNotFoundError, SystemSignalKindError } from "./handoff-signal-kind.errors";
import { HandoffSignalKindStore, SYSTEM_SIGNAL_KINDS } from "./handoff-signal-kind.store";

const fakeLogger = {
  child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
};

describe("HandoffSignalKindStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-signal-kinds-"));
    file = path.join(dir, "nested", "signal-kinds.json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("seeds the 7 built-in kinds on an empty/missing dir", async () => {
    const store = new HandoffSignalKindStore(file, fakeLogger as never);
    await store.onModuleInit();
    const kinds = await store.list();
    expect(kinds).toHaveLength(7);
    expect(kinds.map((k) => k.id).sort()).toEqual([...SYSTEM_SIGNAL_KINDS].map((k) => k.id).sort());
    expect(kinds.every((k) => k.system && k.status === "builtin")).toBe(true);
  });

  it("only `cve` is severity-bearing among the built-ins", async () => {
    const store = new HandoffSignalKindStore(file, fakeLogger as never);
    await store.onModuleInit();
    const kinds = await store.list();
    expect(kinds.filter((k) => k.severityBearing).map((k) => k.id)).toEqual(["cve"]);
  });

  it("re-seeds the built-in defaults when the file is corrupt", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not valid json{{{");
    const store = new HandoffSignalKindStore(file, fakeLogger as never);
    await store.onModuleInit();
    const kinds = await store.list();
    expect(kinds).toHaveLength(7);
  });

  it("leaves a valid, pre-existing file untouched", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const custom = [
      {
        id: "custom-kind",
        from: "loom",
        label: "Custom",
        description: "A custom kind.",
        severityBearing: false,
        status: "pending",
        system: false,
      },
    ];
    await fs.writeFile(file, JSON.stringify(custom));
    const store = new HandoffSignalKindStore(file, fakeLogger as never);
    await store.onModuleInit();
    const kinds = await store.list();
    expect(kinds).toEqual(custom);
  });

  it("list() reads an empty array back for a still-missing file (no crash)", async () => {
    const store = new HandoffSignalKindStore(file, fakeLogger as never);
    // Deliberately not calling onModuleInit — exercise list()'s own fail-open path.
    const kinds = await store.list();
    expect(kinds).toEqual([]);
  });

  describe("create/update/delete/markBuildTask", () => {
    const USER_INPUT: HandoffSignalKindInput = {
      from: "beacon",
      label: "Dependency outdated",
      description: "A dependency has fallen behind its latest release.",
      severityBearing: false,
    };

    it("create mints a slug id from the label and forces pending + system:false", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create(USER_INPUT);
      expect(created.id).toBe("dependency-outdated");
      expect(created.status).toBe("pending");
      expect(created.system).toBe(false);
      const kinds = await store.list();
      expect(kinds).toContainEqual(created);
      expect(kinds).toHaveLength(8);
    });

    it("create disambiguates a slug collision with a numeric suffix", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      const first = await store.create(USER_INPUT);
      const second = await store.create(USER_INPUT);
      expect(first.id).toBe("dependency-outdated");
      expect(second.id).toBe("dependency-outdated-2");
    });

    it("update on an operator kind changes its editable fields", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create(USER_INPUT);
      const updated = await store.update(created.id, { ...USER_INPUT, severityBearing: true });
      expect(updated.id).toBe(created.id);
      expect(updated.severityBearing).toBe(true);
      expect(updated.status).toBe("pending");
      expect(updated.system).toBe(false);
    });

    it("update on a built-in kind throws SystemSignalKindError", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      await expect(store.update("cve", USER_INPUT)).rejects.toThrow(SystemSignalKindError);
    });

    it("update of an unknown id throws SignalKindNotFoundError", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      await expect(store.update("does-not-exist", USER_INPUT)).rejects.toThrow(
        SignalKindNotFoundError,
      );
    });

    it("delete on an operator kind removes it", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create(USER_INPUT);
      await store.delete(created.id);
      const kinds = await store.list();
      expect(kinds.find((k) => k.id === created.id)).toBeUndefined();
      expect(kinds).toHaveLength(7);
    });

    it("delete on a built-in kind throws SystemSignalKindError", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      await expect(store.delete("cve")).rejects.toThrow(SystemSignalKindError);
      const kinds = await store.list();
      expect(kinds.find((k) => k.id === "cve")).toBeDefined();
    });

    it("delete of an unknown id throws SignalKindNotFoundError", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      await expect(store.delete("does-not-exist")).rejects.toThrow(SignalKindNotFoundError);
    });

    it("markBuildTask sets buildTaskId and persists it", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create(USER_INPUT);
      await store.markBuildTask(created.id, "task-42");
      const kinds = await store.list();
      expect(kinds.find((k) => k.id === created.id)?.buildTaskId).toBe("task-42");
    });

    it("markBuildTask on an unknown id throws SignalKindNotFoundError", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      await expect(store.markBuildTask("does-not-exist", "task-1")).rejects.toThrow(
        SignalKindNotFoundError,
      );
    });

    it("update preserves a stored buildTaskId across a retune", async () => {
      const store = new HandoffSignalKindStore(file, fakeLogger as never);
      await store.onModuleInit();
      const created = await store.create(USER_INPUT);
      await store.markBuildTask(created.id, "task-42");
      const updated = await store.update(created.id, { ...USER_INPUT, severityBearing: true });
      expect(updated.buildTaskId).toBe("task-42");
    });
  });
});
