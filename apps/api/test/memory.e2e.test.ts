import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Memory API (e2e)", () => {
  let app: INestApplication
  let vaultDir: string

  beforeAll(async () => {
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-"))
    await fs.mkdir(path.join(vaultDir, "knowledge"), { recursive: true })
    // A small wiki-linked vault across two tiers.
    await fs.writeFile(
      path.join(vaultDir, "MEMORY.md"),
      "---\ntitle: Memory\n---\nCore notes. See [[rohlik]] and [[zibby]].\n",
      "utf8",
    )
    await fs.writeFile(
      path.join(vaultDir, "knowledge", "rohlik.md"),
      "---\ntitle: Rohlik\n---\nGroceries. Checkout never autonomous. Related: [[zibby]].\n",
      "utf8",
    )
    await fs.writeFile(
      path.join(vaultDir, "knowledge", "zibby.md"),
      "---\ntitle: Zibby\n---\nThe orchestrator.\n",
      "utf8",
    )

    process.env.VAULT_DIR = vaultDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(vaultDir, { recursive: true, force: true })
    delete process.env.VAULT_DIR
  })

  it("builds the graph from [[wiki-links]] with tiers", async () => {
    const res = await request(app.getHttpServer()).get("/api/memory/graph").expect(200)
    const ids = res.body.nodes.map((n: { id: string }) => n.id).sort()
    expect(ids).toEqual(["MEMORY", "rohlik", "zibby"])
    const memTier = res.body.nodes.find((n: { id: string }) => n.id === "MEMORY").tier
    const rohlikTier = res.body.nodes.find((n: { id: string }) => n.id === "rohlik").tier
    expect(memTier).toBe("memory")
    expect(rohlikTier).toBe("knowledge")
    // Edges follow the links; a link to a non-existent note is dropped.
    expect(res.body.edges).toContainEqual({ from: "MEMORY", to: "rohlik" })
    expect(res.body.edges).toContainEqual({ from: "rohlik", to: "zibby" })
  })

  it("resolves a note with backlinks", async () => {
    const res = await request(app.getHttpServer()).get("/api/memory/note/zibby").expect(200)
    expect(res.body.title).toBe("Zibby")
    expect(res.body.backlinks.sort()).toEqual(["MEMORY", "rohlik"])
  })

  it("search is index-first (matches title/body), not vector", async () => {
    const res = await request(app.getHttpServer()).get("/api/memory/search").query({ q: "checkout" }).expect(200)
    expect(res.body.results.map((r: { id: string }) => r.id)).toContain("rohlik")
  })

  it("404s for an unknown note", async () => {
    await request(app.getHttpServer()).get("/api/memory/note/ghost").expect(404)
  })

  it("appends an episodic entry to today's daily note (safe write)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/memory/daily")
      .send({ text: "ran the morning briefing" })
      .expect(201)
    expect(res.body.tier).toBe("daily")
    expect(res.body.body).toContain("ran the morning briefing")
  })
})
