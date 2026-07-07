import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompanyConflictError, CompanyNotFoundError } from "./companies.errors";
import { CompaniesStorageService } from "./companies.storage.service";

describe("CompaniesStorageService", () => {
  let dir: string;
  let service: CompaniesStorageService;

  const base = { id: "acme", name: "Acme Corp", desc: "A test company" };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "companies-test-"));
    service = new CompaniesStorageService(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("starts with an empty registry when no manifest exists", async () => {
    expect(await service.list()).toEqual([]);
  });

  it("creates and reads back a company", async () => {
    const created = await service.create(base);
    expect(created).toEqual(base);
    expect(await service.get("acme")).toEqual(base);
  });

  it("rejects a duplicate id (conflict)", async () => {
    await service.create(base);
    await expect(service.create(base)).rejects.toBeInstanceOf(CompanyConflictError);
  });

  it("partially updates an existing company, keeping its id", async () => {
    await service.create(base);
    const updated = await service.update("acme", { desc: "renamed" });
    expect(updated).toMatchObject({ id: "acme", desc: "renamed" });
  });

  it("throws when updating or getting a missing company", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(CompanyNotFoundError);
    await expect(service.update("nope", { name: "x" })).rejects.toBeInstanceOf(
      CompanyNotFoundError,
    );
  });

  it("deletes a company, leaving the rest", async () => {
    await service.create(base);
    await service.create({ ...base, id: "globex", name: "Globex" });
    await service.delete("acme");
    expect((await service.list()).map((c) => c.id)).toEqual(["globex"]);
  });

  it("allows deleting a company even if projects would still reference it (no cascade)", async () => {
    // Companies storage has no notion of projects; this asserts delete never
    // consults or blocks on anything beyond its own registry (Phase 69/70 decision).
    await service.create(base);
    await expect(service.delete("acme")).resolves.toBeUndefined();
  });

  it("throws when deleting a missing company", async () => {
    await expect(service.delete("nope")).rejects.toBeInstanceOf(CompanyNotFoundError);
  });

  it("searches companies by id, name and desc", async () => {
    await service.create(base);
    await service.create({ id: "globex", name: "Globex", desc: "Unrelated" });
    expect((await service.search("acme")).map((c) => c.id)).toEqual(["acme"]);
    expect((await service.search("test company")).map((c) => c.id)).toEqual(["acme"]);
    expect(await service.search("zzz")).toEqual([]);
  });

  it("survives a hand-corrupted manifest by reading it as empty", async () => {
    await fs.writeFile(path.join(dir, "_companies.json"), "{ not json", "utf8");
    expect(await service.list()).toEqual([]);
  });

  it("drops schema-invalid entries from list() rather than failing", async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "_companies.json"),
      JSON.stringify([base, { id: "", name: "invalid" }]),
      "utf8",
    );
    expect((await service.list()).map((c) => c.id)).toEqual(["acme"]);
  });

  describe("person-id backfill (Phase 69)", () => {
    it("assigns a stable slug id to a person missing one", async () => {
      await service.create({ ...base, people: [{ name: "Jan Novák", role: "Client" }] });
      const [company] = await service.list();
      expect(company?.people).toEqual([{ name: "Jan Novák", role: "Client", id: "jan-novak" }]);
    });

    it("gives two same-name people distinct ids", async () => {
      await service.create({
        ...base,
        people: [
          { name: "Jan Novák", role: "Client" },
          { name: "Jan Novák", role: "Stakeholder" },
        ],
      });
      const [company] = await service.list();
      expect(company?.people?.map((p) => p.id)).toEqual(["jan-novak", "jan-novak-2"]);
    });

    it("leaves an existing id untouched", async () => {
      await service.create({
        ...base,
        people: [{ id: "custom-id", name: "Jan Novák", role: "Client" }],
      });
      const [company] = await service.list();
      expect(company?.people?.[0]?.id).toBe("custom-id");
    });
  });
});
