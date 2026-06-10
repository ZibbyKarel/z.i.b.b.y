import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const BASE = "/api/agents"

describe("Agents API (e2e)", () => {
  let app: INestApplication
  let dir: string

  beforeAll(async () => {
    // Isolate persistence to a temp dir, never the real data folder.
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-e2e-"))
    process.env.AGENTS_DIR = dir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    // Clear files between tests for independence.
    for (const entry of await fs.readdir(dir)) {
      await fs.rm(path.join(dir, entry), { force: true })
    }
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(dir, { recursive: true, force: true })
    delete process.env.AGENTS_DIR
  })

  const validBody = {
    id: "writer",
    description: "Writes things",
    instructions: "Write clearly.",
  }

  it("runs the full happy path: create → get → list → update → delete", async () => {
    const created = await request(app.getHttpServer()).post(BASE).send(validBody)
    expect(created.status).toBe(201)
    expect(created.body).toEqual({
      id: "writer",
      // `name` defaults to the id and is mirrored into the frontmatter head.
      name: "writer",
      description: "Writes things",
      instructions: "Write clearly.",
    })

    const got = await request(app.getHttpServer()).get(`${BASE}/writer`)
    expect(got.status).toBe(200)
    expect(got.body).toEqual(created.body)

    const listed = await request(app.getHttpServer()).get(BASE)
    expect(listed.status).toBe(200)
    expect(listed.body).toHaveLength(1)
    expect(listed.body[0].id).toBe("writer")

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/writer`)
      .send({ instructions: "Write very clearly." })
    expect(updated.status).toBe(200)
    expect(updated.body.instructions).toBe("Write very clearly.")
    expect(updated.body.id).toBe("writer")

    const deleted = await request(app.getHttpServer()).delete(`${BASE}/writer`)
    expect(deleted.status).toBe(200)
    expect(deleted.body).toEqual({ id: "writer" })

    const gone = await request(app.getHttpServer()).get(`${BASE}/writer`)
    expect(gone.status).toBe(404)
  })

  it("round-trips the structured dashboard config through the API", async () => {
    const body = {
      id: "stylist",
      name: "Stylist",
      description: "Edits Czech copy",
      glyph: "feather",
      model: "opus",
      thinking: "high",
      tools: ["read", "write"],
      category: "writing",
      instructions: "Polish the prose.",
    }
    const created = await request(app.getHttpServer()).post(BASE).send(body)
    expect(created.status).toBe(201)
    expect(created.body).toEqual(body)

    const got = await request(app.getHttpServer()).get(`${BASE}/stylist`)
    expect(got.body).toEqual(body)
  })

  it("searches agents by id/name/description/category and never collides with /:id", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "writer", description: "Writes things", category: "prose", instructions: "Write." })
      .expect(201)
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "reviewer", description: "Reviews PRs", instructions: "Review." })
      .expect(201)

    const byCategory = await request(app.getHttpServer()).get(`${BASE}/search?q=prose`).expect(200)
    expect(byCategory.body.map((a: { id: string }) => a.id)).toEqual(["writer"])

    const byDesc = await request(app.getHttpServer()).get(`${BASE}/search?q=reviews`).expect(200)
    expect(byDesc.body.map((a: { id: string }) => a.id)).toEqual(["reviewer"])

    // "/search" must hit the search route, not be parsed as an agent id (→ would 404).
    const empty = await request(app.getHttpServer()).get(`${BASE}/search?q=nomatch`).expect(200)
    expect(empty.body).toEqual([])
  })

  it("rejects an out-of-range structured field at the API boundary (400)", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "x", model: "gpt-9", instructions: "y" })
      .expect(400)
  })

  it("returns 409 when creating a duplicate id", async () => {
    await request(app.getHttpServer()).post(BASE).send(validBody).expect(201)
    const conflict = await request(app.getHttpServer()).post(BASE).send(validBody)
    expect(conflict.status).toBe(409)
    expect(conflict.body.message).toContain("writer")
  })

  it("returns 400 for an invalid create body", async () => {
    // missing required `instructions`
    await request(app.getHttpServer()).post(BASE).send({ id: "bad" }).expect(400)

    // id with path separators is rejected by the contract schema
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "../evil", instructions: "y" })
      .expect(400)
  })

  it("returns 400 for an invalid update body", async () => {
    await request(app.getHttpServer()).post(BASE).send(validBody).expect(201)
    await request(app.getHttpServer())
      .patch(`${BASE}/writer`)
      .send({ instructions: "" }) // violates min(1)
      .expect(400)
  })

  it("returns 404 for get/update/delete of a missing agent", async () => {
    await request(app.getHttpServer()).get(`${BASE}/ghost`).expect(404)
    await request(app.getHttpServer())
      .patch(`${BASE}/ghost`)
      .send({ instructions: "x" })
      .expect(404)
    await request(app.getHttpServer()).delete(`${BASE}/ghost`).expect(404)
  })

  it("persists a Markdown file to the isolated AGENTS_DIR", async () => {
    await request(app.getHttpServer()).post(BASE).send(validBody).expect(201)
    const files = await fs.readdir(dir)
    expect(files).toContain("writer.md")
  })
})
