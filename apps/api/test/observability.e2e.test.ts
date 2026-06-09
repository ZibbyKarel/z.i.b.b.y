import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"
import { TRACE_HEADER } from "../src/shared/logging/trace.middleware"

/**
 * Covers the observability layer's externally-observable contract: every response
 * carries a trace id (minted or adopted), and the error path through the global
 * exception filter still returns a well-formed, parseable body with the trace id
 * attached — the half of "what it returned" the happy-path tests don't exercise.
 */
describe("Observability (e2e)", () => {
  let app: INestApplication
  let dir: string

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-e2e-"))
    process.env.AGENTS_DIR = dir

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(dir, { recursive: true, force: true })
    delete process.env.AGENTS_DIR
  })

  it("stamps a trace id on a normal response", async () => {
    const res = await request(app.getHttpServer()).get("/api/health")
    expect(res.status).toBe(200)
    expect(res.headers[TRACE_HEADER]).toMatch(/[0-9a-f-]{36}/)
  })

  it("adopts an inbound trace id and echoes it back", async () => {
    const incoming = "trace-from-caller-123"
    const res = await request(app.getHttpServer())
      .get("/api/health")
      .set(TRACE_HEADER, incoming)
    expect(res.headers[TRACE_HEADER]).toBe(incoming)
  })

  it("returns a parseable error body with the trace id on a validation failure", async () => {
    // An invalid create body trips ts-rest's Zod validation → the global filter.
    const res = await request(app.getHttpServer()).post("/api/agents").send({ id: "x" })
    expect(res.status).toBe(400)
    // Body is still valid JSON the FE can read (status preserved, trace id added).
    expect(typeof res.body).toBe("object")
    expect(res.body).not.toBeNull()
    expect(res.headers[TRACE_HEADER]).toBeDefined()
    expect(res.body.traceId).toBe(res.headers[TRACE_HEADER])
  })
})
