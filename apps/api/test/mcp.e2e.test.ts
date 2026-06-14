import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const HTTP_SERVER = {
  id: "context7",
  type: "http",
  name: "Context7",
  url: "https://mcp.context7.com/mcp",
}

describe("MCP servers API (e2e)", () => {
  let app: INestApplication
  let mcpDir: string
  let credsDir: string

  beforeAll(async () => {
    mcpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-MCP_DIR-"))
    credsDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-MCP_CREDENTIALS_DIR-"))
    process.env.MCP_DIR = mcpDir
    process.env.MCP_CREDENTIALS_DIR = credsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(mcpDir, { recursive: true, force: true })
    await fs.rm(credsDir, { recursive: true, force: true })
    for (const k of ["MCP_DIR", "MCP_CREDENTIALS_DIR"]) delete process.env[k]
  })

  it("creates, lists and gets a server (hasCredentials false initially)", async () => {
    const created = await request(app.getHttpServer()).post("/api/mcp-servers").send(HTTP_SERVER).expect(201)
    expect(created.body.id).toBe("context7")
    expect(created.body.hasCredentials).toBe(false)

    const list = await request(app.getHttpServer()).get("/api/mcp-servers").expect(200)
    expect(list.body.map((s: { id: string }) => s.id)).toContain("context7")
  })

  it("rejects a duplicate id (409) and a stdio server without a command (400)", async () => {
    await request(app.getHttpServer()).post("/api/mcp-servers").send(HTTP_SERVER).expect(409)
    await request(app.getHttpServer())
      .post("/api/mcp-servers")
      .send({ id: "bad-stdio", type: "stdio" })
      .expect(400)
  })

  it("stores credentials separately: the entity file never contains the token", async () => {
    await request(app.getHttpServer())
      .put("/api/mcp-servers/context7/credentials")
      .send({ authToken: "mcp-super-secret-123" })
      .expect(200)

    const got = await request(app.getHttpServer()).get("/api/mcp-servers/context7").expect(200)
    expect(got.body.hasCredentials).toBe(true)
    expect(JSON.stringify(got.body)).not.toContain("mcp-super-secret-123")

    const entityRaw = await fs.readFile(path.join(mcpDir, "context7.json"), "utf8")
    expect(entityRaw).not.toContain("mcp-super-secret-123")
    const credRaw = await fs.readFile(path.join(credsDir, "context7.json"), "utf8")
    expect(credRaw).toContain("mcp-super-secret-123")
  })

  it("rejects a credential whose shape disagrees with the transport (http wants no env)", async () => {
    await request(app.getHttpServer())
      .put("/api/mcp-servers/context7/credentials")
      .send({ env: { NOPE: "1" } })
      .expect(422)
  })

  it("update cannot change the transport type", async () => {
    const updated = await request(app.getHttpServer())
      .patch("/api/mcp-servers/context7")
      .send({ type: "stdio", enabled: false })
      .expect(200)
    // type stays http (immutable); enabled toggles.
    expect(updated.body.type).toBe("http")
    expect(updated.body.enabled).toBe(false)
  })

  it("delete cascades the credentials file", async () => {
    await request(app.getHttpServer()).delete("/api/mcp-servers/context7").expect(200)
    await request(app.getHttpServer()).get("/api/mcp-servers/context7").expect(404)
    await expect(fs.access(path.join(credsDir, "context7.json"))).rejects.toThrow()
  })
})
