import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("Memory API (e2e)", () => {
  let app: INestApplication;
  let vaultDir: string;

  beforeAll(async () => {
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-"));
    await fs.mkdir(path.join(vaultDir, "knowledge"), { recursive: true });
    // A small wiki-linked vault across two tiers.
    await fs.writeFile(
      path.join(vaultDir, "MEMORY.md"),
      "---\ntitle: Memory\n---\nCore notes. See [[rohlik]] and [[zibby]].\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(vaultDir, "knowledge", "rohlik.md"),
      "---\ntitle: Rohlik\n---\nGroceries. Checkout never autonomous. Related: [[zibby]].\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(vaultDir, "knowledge", "zibby.md"),
      "---\ntitle: Zibby\n---\nThe orchestrator.\n",
      "utf8",
    );

    process.env.VAULT_DIR = vaultDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(vaultDir, { recursive: true, force: true });
    delete process.env.VAULT_DIR;
  });

  it("builds the graph from [[wiki-links]] with tiers", async () => {
    const res = await request(app.getHttpServer()).get("/api/memory/graph").expect(200);
    const ids = res.body.nodes.map((n: { id: string }) => n.id).sort();
    expect(ids).toEqual(["MEMORY", "rohlik", "zibby"]);
    const memTier = res.body.nodes.find((n: { id: string }) => n.id === "MEMORY").tier;
    const rohlikTier = res.body.nodes.find((n: { id: string }) => n.id === "rohlik").tier;
    expect(memTier).toBe("memory");
    expect(rohlikTier).toBe("knowledge");
    // Edges follow the links; a link to a non-existent note is dropped.
    expect(res.body.edges).toContainEqual({ from: "MEMORY", to: "rohlik" });
    expect(res.body.edges).toContainEqual({ from: "rohlik", to: "zibby" });
  });

  it("resolves a note with backlinks", async () => {
    const res = await request(app.getHttpServer()).get("/api/memory/note/zibby").expect(200);
    expect(res.body.title).toBe("Zibby");
    expect(res.body.backlinks.sort()).toEqual(["MEMORY", "rohlik"]);
  });

  it("search is index-first (matches title/body), not vector", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/memory/search")
      .query({ q: "checkout" })
      .expect(200);
    expect(res.body.results.map((r: { id: string }) => r.id)).toContain("rohlik");
  });

  it("404s for an unknown note", async () => {
    await request(app.getHttpServer()).get("/api/memory/note/ghost").expect(404);
  });

  it("appends an episodic entry to today's daily note (safe write)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/memory/daily")
      .send({ text: "ran the morning briefing" })
      .expect(201);
    expect(res.body.tier).toBe("daily");
    expect(res.body.body).toContain("ran the morning briefing");
  });

  it("creates a note, re-reads it, and the graph gains a node + edge", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/memory/notes")
      .send({
        id: "feature-x",
        tier: "knowledge",
        title: "Feature X",
        body: "Relates to [[zibby]].",
      })
      .expect(201);
    expect(created.body.id).toBe("feature-x");

    const read = await request(app.getHttpServer()).get("/api/memory/note/feature-x").expect(200);
    expect(read.body.title).toBe("Feature X");
    expect(read.body.links).toContain("zibby");

    const graph = await request(app.getHttpServer()).get("/api/memory/graph").expect(200);
    expect(graph.body.nodes.map((n: { id: string }) => n.id)).toContain("feature-x");
    expect(graph.body.edges).toContainEqual({ from: "feature-x", to: "zibby" });
  });

  it("patches a note: changes body, preserves frontmatter", async () => {
    await request(app.getHttpServer())
      .post("/api/memory/notes")
      .send({
        id: "patchme",
        tier: "knowledge",
        title: "Patch Me",
        body: "before",
        frontmatter: { keep: 1 },
      })
      .expect(201);
    const patched = await request(app.getHttpServer())
      .patch("/api/memory/notes/patchme")
      .send({ body: "after" })
      .expect(200);
    expect(patched.body.body).toContain("after");
    expect(patched.body.frontmatter.keep).toBe(1);
    expect(patched.body.title).toBe("Patch Me");
  });

  it("appends to an existing note", async () => {
    await request(app.getHttpServer())
      .post("/api/memory/notes")
      .send({ id: "appendme", tier: "knowledge", body: "one" })
      .expect(201);
    const after = await request(app.getHttpServer())
      .post("/api/memory/notes/appendme/append")
      .send({ text: "two" })
      .expect(200);
    expect(after.body.body).toContain("one");
    expect(after.body.body).toContain("two");
  });

  it("updateIndex is idempotent and auto-creates a missing MOC", async () => {
    await request(app.getHttpServer())
      .post("/api/memory/index/auto-moc/links")
      .send({ target: "feature-x", label: "Feature X" })
      .expect(200);
    const moc = await request(app.getHttpServer())
      .post("/api/memory/index/auto-moc/links")
      .send({ target: "feature-x", label: "Feature X" })
      .expect(200);
    expect(moc.body.id).toBe("auto-moc");
    expect(moc.body.links).toContain("feature-x");
    const occurrences = (moc.body.body.match(/\[\[feature-x\]\]/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("rejects a duplicate id (409); 404 on unknown patch; 422 on a bad MOC id", async () => {
    await request(app.getHttpServer())
      .post("/api/memory/notes")
      .send({ id: "zibby", tier: "memory", body: "dup" })
      .expect(409);
    await request(app.getHttpServer())
      .patch("/api/memory/notes/ghost")
      .send({ body: "x" })
      .expect(404);
    // `.hidden` is a valid URL segment but fails the note-id guard → 422.
    await request(app.getHttpServer())
      .post("/api/memory/index/.hidden/links")
      .send({ target: "zibby" })
      .expect(422);
  });
});
