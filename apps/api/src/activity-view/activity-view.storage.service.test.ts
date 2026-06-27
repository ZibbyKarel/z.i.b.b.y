import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { ActivityViewStorageService } from "./activity-view.storage.service";

describe("ActivityViewStorageService", () => {
  let dir: string;
  let file: string;
  let service: ActivityViewStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "activity-view-"));
    file = path.join(dir, "activity-view.json");
    service = new ActivityViewStorageService(file);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("seeds the default on first boot and reads it back", async () => {
    await service.onModuleInit();
    expect(await service.read()).toEqual(DEFAULT_ACTIVITY_VIEW);
    // The file was actually written (not just an in-memory default).
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(DEFAULT_ACTIVITY_VIEW);
  });

  it("falls back to the default when the file is missing or malformed", async () => {
    expect(await service.read()).toEqual(DEFAULT_ACTIVITY_VIEW); // missing
    await fs.writeFile(file, "{ not json");
    expect(await service.read()).toEqual(DEFAULT_ACTIVITY_VIEW); // malformed
  });

  it("persists a written view (atomic) and reads it back", async () => {
    const next = { ...DEFAULT_ACTIVITY_VIEW, tasks: "hidden" as const, channels: "visible" as const };
    expect(await service.write(next)).toEqual(next);
    expect(await service.read()).toEqual(next);
  });
});
