import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

describe("Gate rules catalog API (e2e)", () => {
  let app: INestApplication
  let gateRulesDir: string

  beforeAll(async () => {
    gateRulesDir = await fs.mkdtemp(path.join(os.tmpdir(), "gate-rules-e2e-"))
    process.env.GATE_RULES_DIR = gateRulesDir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(gateRulesDir, { recursive: true, force: true })
    delete process.env.GATE_RULES_DIR
  })

  const server = () => app.getHttpServer()

  it("lists the seeded default catalog", async () => {
    const res = await request(server()).get("/api/gate-rules").expect(200)
    expect(Array.isArray(res.body.rules)).toBe(true)
    expect(res.body.rules.length).toBeGreaterThan(0)
    expect(res.body.rules.map((r: { id: string }) => r.id)).toContain("gr-merge")
  })

  it("creates, edits and deletes a rule", async () => {
    const created = await request(server())
      .post("/api/gate-rules")
      .send({ name: "Block force push", match: [{ type: "action", action: "git.force_push" }], decision: "deny" })
      .expect(201)
    const id = created.body.id as string
    expect(id).toMatch(/^gr_/)
    expect(created.body.decision).toBe("deny")

    const updated = await request(server())
      .put(`/api/gate-rules/${id}`)
      .send({ name: "Force push", match: [{ type: "action", action: "git.force_push" }], decision: "ask", resolve: { type: "human" } })
      .expect(200)
    expect(updated.body.decision).toBe("ask")

    await request(server()).delete(`/api/gate-rules/${id}`).expect(200)
    await request(server()).put(`/api/gate-rules/${id}`).send({ match: [{ type: "tool", tool: "read" }], decision: "allow" }).expect(404)
  })

  it("reorders by a full id permutation; rejects a partial list (422)", async () => {
    const before = await request(server()).get("/api/gate-rules").expect(200)
    const ids = before.body.rules.map((r: { id: string }) => r.id) as string[]
    const reversed = [...ids].reverse()

    const res = await request(server()).post("/api/gate-rules/reorder").send({ ids: reversed }).expect(200)
    expect(res.body.rules.map((r: { id: string }) => r.id)).toEqual(reversed)

    await request(server()).post("/api/gate-rules/reorder").send({ ids: [ids[0]] }).expect(422)
  })

  it("rejects an 'ask' rule with no resolve at the contract boundary (400)", async () => {
    await request(server())
      .post("/api/gate-rules")
      .send({ match: [{ type: "action", action: "merge" }], decision: "ask" })
      .expect(400)
  })
})
