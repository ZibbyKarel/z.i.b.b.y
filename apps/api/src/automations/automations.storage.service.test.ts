import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CreateAutomationInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AutomationConflictError,
  AutomationNotFoundError,
  AutomationsStorageService,
  InvalidAutomationIdError,
  MEMORY_DISTILL_AUTOMATION_ID,
  SystemAutomationError,
} from "./automations.storage.service";

const sample: CreateAutomationInput = {
  id: "nightly",
  name: "Nightly digest",
  trigger: { type: "cron", expr: "0 9 * * *" },
  target: { type: "pipeline", pipelineId: "digest" },
  enabled: true,
};
/** What create() persists: the input plus the server-owned `system: false`. */
const persisted = { ...sample, system: false };
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.json`);

describe("AutomationsStorageService", () => {
  let dir: string;
  let service: AutomationsStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "automations-test-"));
    service = new AutomationsStorageService(dir);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("persists an automation as <id>.json and reads it back", async () => {
    const created = await service.create(sample);
    expect(created).toEqual(persisted);
    const onDisk = JSON.parse(await fs.readFile(fileFor(dir, "nightly"), "utf8"));
    expect(onDisk.id).toBe("nightly");
    expect(onDisk.system).toBe(false);
    expect(await service.get("nightly")).toEqual(persisted);
  });

  it("rejects creating an automation with an existing id", async () => {
    await service.create(sample);
    await expect(service.create(sample)).rejects.toBeInstanceOf(AutomationConflictError);
  });

  it("404s on get/delete of a missing automation", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(AutomationNotFoundError);
    await expect(service.delete("nope")).rejects.toBeInstanceOf(AutomationNotFoundError);
  });

  it("merges a partial patch on update without touching the id", async () => {
    await service.create(sample);
    const updated = await service.update("nightly", { enabled: false });
    expect(updated.id).toBe("nightly");
    expect(updated.enabled).toBe(false);
    expect(updated.name).toBe("Nightly digest");
  });

  it("stamps lastFiredAt via markFired", async () => {
    await service.create(sample);
    const at = "2026-06-04T09:00:00.000Z";
    const fired = await service.markFired("nightly", at);
    expect(fired.lastFiredAt).toBe(at);
    expect((await service.get("nightly")).lastFiredAt).toBe(at);
  });

  it("skips a corrupt file in list() instead of failing", async () => {
    await service.create(sample);
    await fs.writeFile(fileFor(dir, "broken"), "{ not json", "utf8");
    const list = await service.list();
    // Ignore the seeded system automation(s); the corrupt file must be skipped.
    expect(list.filter((a) => !a.system).map((a) => a.id)).toEqual(["nightly"]);
  });

  it("refuses unsafe ids (path traversal)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(service.create({ ...sample, id })).rejects.toBeInstanceOf(
        InvalidAutomationIdError,
      );
    }
  });

  it("seeds the memory-distill system automation on init", async () => {
    const seeded = await service.get(MEMORY_DISTILL_AUTOMATION_ID);
    expect(seeded.system).toBe(true);
    expect(seeded.target).toEqual({ type: "memory-distill" });
    expect(seeded.trigger.type).toBe("cron");
  });

  it("refuses to delete a system automation", async () => {
    await expect(service.delete(MEMORY_DISTILL_AUTOMATION_ID)).rejects.toBeInstanceOf(
      SystemAutomationError,
    );
    // Still there.
    expect((await service.get(MEMORY_DISTILL_AUTOMATION_ID)).system).toBe(true);
  });

  it("lets a system automation be rescheduled but refuses other changes", async () => {
    const rescheduled = await service.update(MEMORY_DISTILL_AUTOMATION_ID, {
      trigger: { type: "cron", expr: "30 2 * * *" },
    });
    expect(rescheduled.trigger).toEqual({ type: "cron", expr: "30 2 * * *" });
    expect(rescheduled.system).toBe(true);

    await expect(
      service.update(MEMORY_DISTILL_AUTOMATION_ID, { enabled: false }),
    ).rejects.toBeInstanceOf(SystemAutomationError);
    await expect(
      service.update(MEMORY_DISTILL_AUTOMATION_ID, { target: { type: "discovery" } }),
    ).rejects.toBeInstanceOf(SystemAutomationError);
  });

  it("self-heals on re-init: keeps the operator's schedule, re-asserts system+target", async () => {
    await service.update(MEMORY_DISTILL_AUTOMATION_ID, {
      trigger: { type: "cron", expr: "15 4 * * *" },
    });
    // Tamper with the on-disk file: flip system off and retarget it.
    const file = fileFor(dir, MEMORY_DISTILL_AUTOMATION_ID);
    const tampered = JSON.parse(await fs.readFile(file, "utf8"));
    await fs.writeFile(
      file,
      JSON.stringify({ ...tampered, system: false, target: { type: "discovery" } }),
      "utf8",
    );

    await new AutomationsStorageService(dir).onModuleInit();

    const healed = await service.get(MEMORY_DISTILL_AUTOMATION_ID);
    expect(healed.system).toBe(true);
    expect(healed.target).toEqual({ type: "memory-distill" });
    // The operator's schedule survives the self-heal.
    expect(healed.trigger).toEqual({ type: "cron", expr: "15 4 * * *" });
  });
});
