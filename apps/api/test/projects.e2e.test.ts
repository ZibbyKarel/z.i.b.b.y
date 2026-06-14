import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const BASE = "/api/projects"
const CATS = "/api/projects/categories"

describe("Projects API (e2e)", () => {
  let app: INestApplication
  let dir: string
  let secretsDir: string

  const project = {
    id: "media-vault",
    name: "media-vault",
    path: "~/Projects/media-vault",
    category: "Média & domácnost",
  }

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "projects-e2e-"))
    secretsDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-secrets-e2e-"))
    process.env.PROJECTS_DIR = dir
    process.env.PROJECT_SECRETS_DIR = secretsDir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(dir, { recursive: true, force: true })
    await fs.rm(secretsDir, { recursive: true, force: true })
    delete process.env.PROJECTS_DIR
    delete process.env.PROJECT_SECRETS_DIR
  })

  it("starts empty, and GET /projects/categories is not shadowed by GET /projects/:id", async () => {
    expect((await request(app.getHttpServer()).get(BASE)).body).toEqual([])
    // 200 (not 404) proves the categories controller is mounted ahead of :id.
    expect((await request(app.getHttpServer()).get(CATS)).status).toBe(200)
  })

  it("creates, reads, updates and deletes a project", async () => {
    const created = await request(app.getHttpServer()).post(BASE).send(project)
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ id: "media-vault", path: "~/Projects/media-vault" })

    await request(app.getHttpServer()).get(`${BASE}/media-vault`).expect(200)

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/media-vault`)
      .send({ desc: "moved" })
    expect(updated.body.desc).toBe("moved")

    await request(app.getHttpServer()).delete(`${BASE}/media-vault`).expect(200)
    await request(app.getHttpServer()).get(`${BASE}/media-vault`).expect(404)
  })

  it("rejects a duplicate id (409) and an invalid body (400)", async () => {
    await request(app.getHttpServer()).post(BASE).send(project).expect(201)
    await request(app.getHttpServer()).post(BASE).send(project).expect(409)
    // Missing required path → contract 400.
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "x", name: "x" })
      .expect(400)
    await request(app.getHttpServer()).delete(`${BASE}/media-vault`).expect(200)
  })

  it("searches projects by name/desc/category without colliding with /:id or /categories", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "auth-svc", name: "auth-svc", desc: "Login service", path: "~/p/auth" })
      .expect(201)

    const hits = await request(app.getHttpServer()).get(`${BASE}/search?q=login`).expect(200)
    expect(hits.body.map((p: { id: string }) => p.id)).toEqual(["auth-svc"])

    // "/search" resolves to the search route, never to GET /projects/:id (→ 404).
    const empty = await request(app.getHttpServer()).get(`${BASE}/search?q=zzz`).expect(200)
    expect(empty.body).toEqual([])

    await request(app.getHttpServer()).delete(`${BASE}/auth-svc`).expect(200)
  })

  it("round-trips non-secret env on the entity (committed)", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "env-proj", name: "env-proj", path: "~/p/env", env: { NODE_ENV: "production" } })
      .expect(201)
    const got = await request(app.getHttpServer()).get(`${BASE}/env-proj`).expect(200)
    expect(got.body.env).toEqual({ NODE_ENV: "production" })
    expect(got.body.hasSecrets).toBe(false)
    // env lives on the committed manifest; secrets never do.
    const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8")
    expect(raw).toContain("NODE_ENV")
    await request(app.getHttpServer()).delete(`${BASE}/env-proj`).expect(200)
  })

  it("stores secrets write-only: hasSecrets flips, the secret never reads back, cascades on delete", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "sec-proj", name: "sec-proj", path: "~/p/sec" })
      .expect(201)

    await request(app.getHttpServer())
      .put(`${BASE}/sec-proj/secrets`)
      .send({ DB_URL: "postgres://super-secret" })
      .expect(200)

    const got = await request(app.getHttpServer()).get(`${BASE}/sec-proj`).expect(200)
    expect(got.body.hasSecrets).toBe(true)
    expect(JSON.stringify(got.body)).not.toContain("super-secret")
    // The secret lives ONLY under PROJECT_SECRETS_DIR, never the manifest.
    const manifest = await fs.readFile(path.join(dir, "_projects.json"), "utf8")
    expect(manifest).not.toContain("super-secret")
    const secRaw = await fs.readFile(path.join(secretsDir, "sec-proj.json"), "utf8")
    expect(secRaw).toContain("super-secret")

    // Deleting the project cascades the secrets file.
    await request(app.getHttpServer()).delete(`${BASE}/sec-proj`).expect(200)
    await expect(fs.access(path.join(secretsDir, "sec-proj.json"))).rejects.toThrow()
  })

  it("refuses to delete a project category that still has projects (409)", async () => {
    await request(app.getHttpServer()).post(CATS).send({ name: "Vývoj", glyph: "code" }).expect(201)
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "auth-svc", name: "auth-svc", path: "~/p/auth", category: "Vývoj" })
      .expect(201)

    await request(app.getHttpServer()).delete(`${CATS}/Vývoj`).expect(409)

    // Removing the project frees the category for deletion.
    await request(app.getHttpServer()).delete(`${BASE}/auth-svc`).expect(200)
    await request(app.getHttpServer()).delete(`${CATS}/${encodeURIComponent("Vývoj")}`).expect(200)
  })
})
