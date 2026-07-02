import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MachineActionStore } from "./machine-action.store";
import { MachineActionRejectedError, MachineService } from "./machine.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

describe("MachineService (N5a — file ops behind the gate)", () => {
  let storeDir: string;
  let folder: string;
  let store: MachineActionStore;
  let approvals: { register: ReturnType<typeof vi.fn>; requestApproval: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let service: MachineService;

  const action = (over: Partial<{ folder: string; find: string; replace: string }> = {}) => ({
    kind: "rename-files" as const,
    folder,
    find: "IMG_",
    replace: "vylet-",
    ...over,
  });

  beforeEach(async () => {
    storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "machine-store-"));
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "machine-folder-"));
    await fs.writeFile(path.join(folder, "IMG_1.jpg"), "a");
    await fs.writeFile(path.join(folder, "IMG_2.jpg"), "b");
    await fs.writeFile(path.join(folder, "readme.txt"), "c");
    store = new MachineActionStore(storeDir);
    await store.onModuleInit();
    approvals = {
      register: vi.fn(),
      requestApproval: vi.fn(async (input: { runId: string }) => ({
        id: `machine_${input.runId}`,
        status: "pending",
      })),
    };
    activity = { record: vi.fn(async () => {}) };
    service = new MachineService(store, approvals as never, activity as never, fakeLogger as never);
    service.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(storeDir, { recursive: true, force: true });
    await fs.rm(folder, { recursive: true, force: true });
  });

  const names = async () => (await fs.readdir(folder)).sort();

  it("registers as the ResumableRunner for the machine approval kind", () => {
    expect(approvals.register).toHaveBeenCalledWith("machine", service);
  });

  it("propose computes the preview, parks a HIGH-risk approval, and touches NOTHING", async () => {
    const record = await service.propose(action());
    expect(record.state).toBe("proposed");
    expect(record.preview).toEqual([
      { from: "IMG_1.jpg", to: "vylet-1.jpg" },
      { from: "IMG_2.jpg", to: "vylet-2.jpg" },
    ]);
    expect(record.approvalId).toBe(`machine_${record.id}`);
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "machine", action: "fs.rename", risk: "high" }),
    );
    // Dry-run only — the disk is untouched until the operator approves.
    expect(await names()).toEqual(["IMG_1.jpg", "IMG_2.jpg", "readme.txt"]);
  });

  it("approve (resume) executes the preview exactly once and records the action", async () => {
    const record = await service.propose(action());
    await service.resume(record.id);

    expect(await names()).toEqual(["readme.txt", "vylet-1.jpg", "vylet-2.jpg"]);
    const stored = await store.get(record.id);
    expect(stored.state).toBe("executed");
    expect(stored.executedAt).toBeDefined();
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "machine-action" }),
    );

    // A second resume is an idempotent no-op (fail-closed).
    activity.record.mockClear();
    await service.resume(record.id);
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("reject (cancel) marks the record and leaves the disk untouched", async () => {
    const record = await service.propose(action());
    service.cancel(record.id);
    await vi.waitFor(async () => {
      expect((await store.get(record.id)).state).toBe("rejected");
    });
    expect(await names()).toEqual(["IMG_1.jpg", "IMG_2.jpg", "readme.txt"]);
    // A rejected record can never execute.
    await service.resume(record.id);
    expect(await names()).toEqual(["IMG_1.jpg", "IMG_2.jpg", "readme.txt"]);
  });

  it("fails closed at propose: relative folder, traversal, no matches, collisions", async () => {
    await expect(service.propose(action({ folder: "fotky" }))).rejects.toBeInstanceOf(
      MachineActionRejectedError,
    );
    await expect(
      service.propose(action({ replace: "../escape" })),
    ).rejects.toBeInstanceOf(MachineActionRejectedError);
    await expect(service.propose(action({ find: "NOPE" }))).rejects.toBeInstanceOf(
      MachineActionRejectedError,
    );
    // Collision: both IMG_1/IMG_2 would map onto the same target name.
    await expect(service.propose(action({ find: "1.jpg", replace: "2.jpg" }))).rejects.toThrow(
      /collision/,
    );
    // Nothing was persisted or parked for any of the refused proposals.
    expect(await store.list()).toEqual([]);
    expect(approvals.requestApproval).not.toHaveBeenCalled();
  });

  it("open-maps (N5b): proposes low-risk with empty preview; approve calls the opener", async () => {
    const opener = vi.fn(async () => {});
    const withOpener = new MachineService(
      store,
      approvals as never,
      activity as never,
      fakeLogger as never,
      opener,
    );
    const record = await withOpener.propose({ kind: "open-maps", query: "nejbližší lékárna" });
    expect(record.preview).toEqual([]);
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "machine", action: "maps.open", risk: "low" }),
    );
    expect(opener).not.toHaveBeenCalled(); // propose never executes

    await withOpener.resume(record.id);
    expect(opener).toHaveBeenCalledWith(`maps://?q=${encodeURIComponent("nejbližší lékárna")}`);
    expect((await store.get(record.id)).state).toBe("executed");
  });

  it("open-maps reject never opens anything", async () => {
    const opener = vi.fn(async () => {});
    const withOpener = new MachineService(
      store,
      approvals as never,
      activity as never,
      fakeLogger as never,
      opener,
    );
    const record = await withOpener.propose({ kind: "open-maps", query: "Brno" });
    withOpener.cancel(record.id);
    await vi.waitFor(async () => {
      expect((await store.get(record.id)).state).toBe("rejected");
    });
    await withOpener.resume(record.id);
    expect(opener).not.toHaveBeenCalled();
  });

  it("an approved action whose source vanished fails with a recorded error, never throws", async () => {
    const record = await service.propose(action());
    await fs.rm(path.join(folder, "IMG_1.jpg"));
    await service.resume(record.id);
    const stored = await store.get(record.id);
    expect(stored.state).toBe("failed");
    expect(stored.error).toBeDefined();
  });
});
