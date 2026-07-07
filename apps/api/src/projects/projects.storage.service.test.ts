import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectConflictError, ProjectNotFoundError } from "./projects.errors";
import { ProjectsStorageService } from "./projects.storage.service";

describe("ProjectsStorageService", () => {
  let dir: string;
  let service: ProjectsStorageService;

  const base = {
    id: "media-vault",
    name: "media-vault",
    path: "~/Projects/media-vault",
    category: "Média & domácnost",
  };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "projects-test-"));
    service = new ProjectsStorageService(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("starts with an empty registry when no manifest exists", async () => {
    expect(await service.list()).toEqual([]);
  });

  it("creates and reads back a project", async () => {
    const created = await service.create(base);
    expect(created).toEqual(base);
    expect(await service.get("media-vault")).toEqual(base);
  });

  it("does not persist the computed hasSecrets onto the manifest", async () => {
    await service.create(base);
    const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
    expect(raw).not.toContain("hasSecrets");
  });

  it("rejects a duplicate id (conflict)", async () => {
    await service.create(base);
    await expect(service.create(base)).rejects.toBeInstanceOf(ProjectConflictError);
  });

  it("partially updates an existing project, keeping its id", async () => {
    await service.create(base);
    const updated = await service.update("media-vault", { desc: "moved" });
    expect(updated).toMatchObject({ id: "media-vault", desc: "moved" });
  });

  it("throws when updating or getting a missing project", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(service.update("nope", { name: "x" })).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it("deletes a project, leaving the rest", async () => {
    await service.create(base);
    await service.create({ ...base, id: "auth-svc", name: "auth-svc", path: "~/p/auth" });
    await service.delete("media-vault");
    expect((await service.list()).map((p) => p.id)).toEqual(["auth-svc"]);
  });

  it("throws when deleting a missing project", async () => {
    await expect(service.delete("nope")).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("survives a hand-corrupted manifest by reading it as empty", async () => {
    await fs.writeFile(path.join(dir, "_projects.json"), "{ not json", "utf8");
    expect(await service.list()).toEqual([]);
  });

  describe("person-id backfill (Phase 69)", () => {
    it("assigns a stable slug id to a person missing one", async () => {
      await service.create({
        ...base,
        identity: { people: [{ name: "Jana Nováková", role: "PM" }] },
      });
      const [project] = await service.list();
      expect(project?.identity?.people).toEqual([
        { name: "Jana Nováková", role: "PM", id: "jana-novakova" },
      ]);
    });

    it("gives two same-name people distinct ids", async () => {
      await service.create({
        ...base,
        identity: {
          people: [
            { name: "Jan Novák", role: "Dev" },
            { name: "Jan Novák", role: "Client" },
          ],
        },
      });
      const [project] = await service.list();
      expect(project?.identity?.people?.map((p) => p.id)).toEqual(["jan-novak", "jan-novak-2"]);
    });

    it("leaves an existing id untouched", async () => {
      await service.create({
        ...base,
        identity: { people: [{ id: "custom-id", name: "Jan Novák", role: "Dev" }] },
      });
      const [project] = await service.list();
      expect(project?.identity?.people?.[0]?.id).toBe("custom-id");
    });

    it("persists a backfilled id on the next write", async () => {
      await service.create({
        ...base,
        identity: { people: [{ name: "Jan Novák", role: "Dev" }] },
      });
      // Trigger a write unrelated to identity; the in-memory backfill from list()
      // should flow through and land on disk.
      await service.update("media-vault", { desc: "moved" });
      const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
      expect(raw).toContain("jan-novak");
    });
  });
});
