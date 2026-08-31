import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamConflictError, TeamNotFoundError } from "./teams.errors";
import { TeamsStorageService } from "./teams.storage.service";

describe("TeamsStorageService", () => {
  let dir: string;
  let service: TeamsStorageService;

  const base = { id: "devrel", name: "DevRel", desc: "A test team" };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-teams-"));
    service = new TeamsStorageService(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("starts with an empty registry when no manifest exists", async () => {
    expect(await service.list()).toEqual([]);
  });

  it("creates and reads back a team with a knowledge base", async () => {
    await service.create({
      id: "devrel",
      name: "DevRel",
      companyId: "shoptet",
      knowledgeBase: { kind: "vault", path: "/tmp/kb", readOnly: true },
    });
    const team = await service.get("devrel");
    expect(team.knowledgeBase).toEqual({ kind: "vault", path: "/tmp/kb", readOnly: true });
  });

  it("rejects a duplicate id (conflict)", async () => {
    await service.create(base);
    await expect(service.create(base)).rejects.toBeInstanceOf(TeamConflictError);
  });

  it("partially updates an existing team, keeping its id", async () => {
    await service.create(base);
    const updated = await service.update("devrel", { desc: "renamed" });
    expect(updated).toMatchObject({ id: "devrel", desc: "renamed" });
  });

  describe("companyId link/unlink (clear semantics)", () => {
    it("sets companyId via a normal patch", async () => {
      await service.create(base);
      const updated = await service.update("devrel", { companyId: "shoptet" });
      expect(updated.companyId).toBe("shoptet");
    });

    it("clears a linked companyId when the patch sends `null`", async () => {
      await service.create({ ...base, companyId: "shoptet" });
      const updated = await service.update("devrel", { companyId: null });
      expect(updated.companyId).toBeUndefined();
    });

    it("leaves companyId untouched when the patch omits the key entirely", async () => {
      await service.create({ ...base, companyId: "shoptet" });
      const updated = await service.update("devrel", { desc: "moved" });
      expect(updated.companyId).toBe("shoptet");
    });
  });

  describe("knowledgeBase clear semantics", () => {
    const kb = { kind: "vault" as const, path: "/tmp/kb", readOnly: true as const };

    it("sets knowledgeBase via a normal patch", async () => {
      await service.create(base);
      const updated = await service.update("devrel", { knowledgeBase: kb });
      expect(updated.knowledgeBase).toEqual(kb);
    });

    it("clears a linked knowledgeBase when the patch sends `null`", async () => {
      await service.create({ ...base, knowledgeBase: kb });
      const updated = await service.update("devrel", { knowledgeBase: null });
      expect(updated.knowledgeBase).toBeUndefined();
    });

    it("leaves knowledgeBase untouched when the patch omits the key entirely", async () => {
      await service.create({ ...base, knowledgeBase: kb });
      const updated = await service.update("devrel", { name: "DevRel Team" });
      expect(updated.knowledgeBase).toEqual(kb);
    });
  });

  it("throws when updating or getting a missing team", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(TeamNotFoundError);
    await expect(service.update("nope", { name: "x" })).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it("keeps the list sorted by id", async () => {
    await service.create({ id: "zeta", name: "Zeta" });
    await service.create({ id: "alpha", name: "Alpha" });
    expect((await service.list()).map((t) => t.id)).toEqual(["alpha", "zeta"]);
  });

  it("deletes a team, leaving the rest", async () => {
    await service.create(base);
    await service.create({ ...base, id: "globex", name: "Globex" });
    await service.delete("devrel");
    expect((await service.list()).map((t) => t.id)).toEqual(["globex"]);
  });

  it("allows deleting a team even if a project would still reference it (no cascade)", async () => {
    // Teams storage has no notion of projects; this asserts delete never
    // consults or blocks on anything beyond its own registry (mirrors the
    // companies Phase 69/70 decision).
    await service.create(base);
    await expect(service.delete("devrel")).resolves.toBeUndefined();
  });

  it("throws when deleting a missing team", async () => {
    await expect(service.delete("nope")).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it("searches teams by id, name and desc", async () => {
    await service.create(base);
    await service.create({ id: "globex", name: "Globex", desc: "Unrelated" });
    expect((await service.search("devrel")).map((t) => t.id)).toEqual(["devrel"]);
    expect((await service.search("test team")).map((t) => t.id)).toEqual(["devrel"]);
    expect(await service.search("zzz")).toEqual([]);
  });

  it("survives a hand-corrupted manifest by reading it as empty", async () => {
    await fs.writeFile(path.join(dir, "_teams.json"), "{ not json", "utf8");
    expect(await service.list()).toEqual([]);
  });

  it("drops corrupt rows instead of failing the listing", async () => {
    await service.create({ id: "devrel", name: "DevRel" });
    const file = path.join(dir, "_teams.json");
    const rows = JSON.parse(await fs.readFile(file, "utf8")) as unknown[];
    await fs.writeFile(file, JSON.stringify([...rows, { id: "", name: "" }], null, 2));
    expect((await service.list()).map((t) => t.id)).toEqual(["devrel"]);
  });
});
