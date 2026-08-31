import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeJson } from "../shared/file-storage";
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

  describe("companyId link/unlink (Phase 72)", () => {
    it("sets companyId via a normal patch", async () => {
      await service.create(base);
      const updated = await service.update("media-vault", { companyId: "acme" });
      expect(updated.companyId).toBe("acme");
    });

    it("clears a linked companyId when the patch sends `null`", async () => {
      await service.create({ ...base, companyId: "acme" });
      const updated = await service.update("media-vault", { companyId: null });
      expect(updated.companyId).toBeUndefined();
    });

    it("leaves companyId untouched when the patch omits the key entirely", async () => {
      await service.create({ ...base, companyId: "acme" });
      const updated = await service.update("media-vault", { desc: "moved" });
      expect(updated.companyId).toBe("acme");
    });
  });

  describe("teamId link/unlink (Phase 3, team knowledge base)", () => {
    it("sets teamId via a normal patch", async () => {
      await service.create(base);
      const updated = await service.update("media-vault", { teamId: "devrel" });
      expect(updated.teamId).toBe("devrel");
    });

    it("clears a linked teamId when the patch sends `null`", async () => {
      await service.create({ ...base, teamId: "devrel" });
      const updated = await service.update("media-vault", { teamId: null });
      expect(updated.teamId).toBeUndefined();
    });

    it("leaves teamId untouched when the patch omits the key entirely", async () => {
      await service.create({ ...base, teamId: "devrel" });
      const updated = await service.update("media-vault", { name: "x" });
      expect(updated.teamId).toBe("devrel");
    });
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

  describe("logo externalization (Phase 113)", () => {
    const dataUri = "data:image/png;base64,aGVsbG8gd29ybGQ="; // "hello world"

    it("externalizes an uploaded data-URI logo to an asset file, keeping the wire value inline", async () => {
      const created = await service.create({ ...base, logo: dataUri });
      // The caller-facing entity keeps the full data URI...
      expect(created.logo).toBe(dataUri);

      // ...but the manifest on disk stores only a bare asset reference, never
      // the data URI — the core acceptance criterion for this commit.
      const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
      expect(raw).not.toContain("data:image");
      const manifest = safeJson(raw) as Array<Record<string, unknown>>;
      expect(manifest[0]?.logo).toBe("assets/media-vault.png");

      const assetBytes = await fs.readFile(path.join(dir, "assets", "media-vault.png"));
      expect(assetBytes.toString("utf8")).toBe("hello world");
    });

    it("re-inlines the asset reference back to a data URI on list()/get()", async () => {
      await service.create({ ...base, logo: dataUri });
      const [project] = await service.list();
      expect(project?.logo).toBe(dataUri);
      expect((await service.get("media-vault")).logo).toBe(dataUri);
    });

    it("stores a /-rooted logo path verbatim, writing no asset file", async () => {
      await service.create({ ...base, logo: "/avatars/architect.png" });
      const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
      const manifest = safeJson(raw) as Array<Record<string, unknown>>;
      expect(manifest[0]?.logo).toBe("/avatars/architect.png");
      await expect(fs.access(path.join(dir, "assets", "media-vault.png"))).rejects.toBeTruthy();
    });

    it("removes the stale asset file when a logo is replaced with a new upload", async () => {
      await service.create({ ...base, logo: dataUri });
      const assetFile = path.join(dir, "assets", "media-vault.png");
      await expect(fs.access(assetFile)).resolves.toBeUndefined();

      const otherDataUri = "data:image/png;base64,Z29vZGJ5ZSB3b3JsZA=="; // "goodbye world"
      const updated = await service.update("media-vault", { logo: otherDataUri });
      expect(updated.logo).toBe(otherDataUri);
      const assetBytes = await fs.readFile(assetFile);
      expect(assetBytes.toString("utf8")).toBe("goodbye world");
    });

    it("removes the asset file when a logo is explicitly cleared (`logo: null`)", async () => {
      await service.create({ ...base, logo: dataUri });
      const assetFile = path.join(dir, "assets", "media-vault.png");
      await expect(fs.access(assetFile)).resolves.toBeUndefined();

      const updated = await service.update("media-vault", { logo: null });
      expect(updated.logo).toBeUndefined();
      await expect(fs.access(assetFile)).rejects.toBeTruthy();
    });

    it("leaves an unrelated field update's logo untouched", async () => {
      await service.create({ ...base, logo: dataUri });
      const updated = await service.update("media-vault", { desc: "moved" });
      expect(updated.logo).toBe(dataUri);
      expect((await service.get("media-vault")).logo).toBe(dataUri);
    });

    it("removes the logo asset file along with the project on delete", async () => {
      await service.create({ ...base, logo: dataUri });
      const assetFile = path.join(dir, "assets", "media-vault.png");
      await expect(fs.access(assetFile)).resolves.toBeUndefined();

      await service.delete("media-vault");
      await expect(fs.access(assetFile)).rejects.toBeTruthy();
    });
  });

  describe("inline-logo sweep migration (Phase 113)", () => {
    it("externalizes a pre-existing inline data: logo found in the raw manifest on startup", async () => {
      const dataUri = "data:image/png;base64,aGVsbG8gd29ybGQ=";
      // Written directly to disk, bypassing the service, mirroring a manifest
      // persisted before logo externalization existed.
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "_projects.json"),
        `${JSON.stringify([{ ...base, logo: dataUri }], null, 2)}\n`,
        "utf8",
      );

      // A fresh service instance over the same directory simulates a server
      // restart, which is when the sweep runs.
      const restarted = new ProjectsStorageService(dir);
      await restarted.onModuleInit();

      const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
      expect(raw).not.toContain("data:image");
      const manifest = safeJson(raw) as Array<Record<string, unknown>>;
      expect(manifest[0]?.logo).toBe("assets/media-vault.png");

      const project = await restarted.get("media-vault");
      expect(project.logo).toBe(dataUri);
    });

    it("is idempotent — running the sweep twice is safe", async () => {
      const dataUri = "data:image/png;base64,aGVsbG8gd29ybGQ=";
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "_projects.json"),
        `${JSON.stringify([{ ...base, logo: dataUri }], null, 2)}\n`,
        "utf8",
      );

      const first = new ProjectsStorageService(dir);
      await first.onModuleInit();
      const afterFirst = await fs.readFile(path.join(dir, "_projects.json"), "utf8");

      const second = new ProjectsStorageService(dir);
      await second.onModuleInit();
      const afterSecond = await fs.readFile(path.join(dir, "_projects.json"), "utf8");

      expect(afterSecond).toBe(afterFirst);
      const project = await second.get("media-vault");
      expect(project.logo).toBe(dataUri);
    });

    it("leaves a /-rooted logo path byte-for-byte untouched on startup", async () => {
      await fs.mkdir(dir, { recursive: true });
      const original = `${JSON.stringify([{ ...base, logo: "/avatars/architect.png" }], null, 2)}\n`;
      await fs.writeFile(path.join(dir, "_projects.json"), original, "utf8");

      const restarted = new ProjectsStorageService(dir);
      await restarted.onModuleInit();

      const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
      expect(raw).toBe(original);
    });
  });
});
