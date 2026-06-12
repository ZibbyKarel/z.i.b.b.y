import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"

const SLACK = {
  id: "team-slack",
  kind: "slack",
  name: "Team Slack",
  config: { kind: "slack", channels: ["C123"] },
}

describe("Integrations API (e2e)", () => {
  let app: INestApplication
  let integrationsDir: string
  let credentialsDir: string

  beforeAll(async () => {
    integrationsDir = await fs.mkdtemp(path.join(os.tmpdir(), "int-INTEGRATIONS_DIR-"))
    credentialsDir = await fs.mkdtemp(path.join(os.tmpdir(), "int-CREDENTIALS_DIR-"))
    process.env.INTEGRATIONS_DIR = integrationsDir
    process.env.CREDENTIALS_DIR = credentialsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(integrationsDir, { recursive: true, force: true })
    await fs.rm(credentialsDir, { recursive: true, force: true })
    for (const k of ["INTEGRATIONS_DIR", "CREDENTIALS_DIR"]) delete process.env[k]
  })

  it("creates, lists and gets an integration (hasCredentials false initially)", async () => {
    const created = await request(app.getHttpServer()).post("/api/integrations").send(SLACK).expect(201)
    expect(created.body.id).toBe("team-slack")
    expect(created.body.status).toBe("disconnected")
    expect(created.body.hasCredentials).toBe(false)

    const list = await request(app.getHttpServer()).get("/api/integrations").expect(200)
    expect(list.body.map((i: { id: string }) => i.id)).toContain("team-slack")

    const got = await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(200)
    expect(got.body.hasCredentials).toBe(false)
  })

  it("rejects a duplicate id (409) and a kind/config mismatch (422)", async () => {
    await request(app.getHttpServer()).post("/api/integrations").send(SLACK).expect(409)
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({ id: "bad", kind: "slack", config: { kind: "email", imapHost: "h", imapPort: 1, smtpHost: "h", smtpPort: 1, user: "u" } })
      .expect(422)
  })

  it("stores credentials separately: the entity file never contains the token", async () => {
    await request(app.getHttpServer())
      .put("/api/integrations/team-slack/credentials")
      .send({ token: "xoxb-super-secret-123" })
      .expect(200)

    // The entity reports hasCredentials but never the secret.
    const got = await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(200)
    expect(got.body.hasCredentials).toBe(true)
    expect(JSON.stringify(got.body)).not.toContain("xoxb-super-secret-123")

    // Raw-file assertion: token lives ONLY under CREDENTIALS_DIR.
    const entityRaw = await fs.readFile(path.join(integrationsDir, "team-slack.json"), "utf8")
    expect(entityRaw).not.toContain("xoxb-super-secret-123")
    const credRaw = await fs.readFile(path.join(credentialsDir, "team-slack.json"), "utf8")
    expect(credRaw).toContain("xoxb-super-secret-123")
  })

  it("rejects a credential whose kind disagrees (slack wants a token, not a password)", async () => {
    await request(app.getHttpServer())
      .put("/api/integrations/team-slack/credentials")
      .send({ password: "nope" })
      .expect(422)
  })

  it("test endpoint: 409 without credentials, 200 + connected after", async () => {
    await request(app.getHttpServer()).post("/api/integrations").send({
      id: "no-creds",
      kind: "slack",
      config: { kind: "slack", channels: [] },
    }).expect(201)
    await request(app.getHttpServer()).post("/api/integrations/no-creds/test").send({}).expect(409)

    const tested = await request(app.getHttpServer()).post("/api/integrations/team-slack/test").send({}).expect(200)
    expect(tested.body.ok).toBe(true)
    const got = await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(200)
    expect(got.body.status).toBe("connected")
  })

  it("update cannot change kind (config of a different kind → 422)", async () => {
    await request(app.getHttpServer())
      .patch("/api/integrations/team-slack")
      .send({ config: { kind: "email", imapHost: "h", imapPort: 1, smtpHost: "h", smtpPort: 1, user: "u" } })
      .expect(422)
    // A same-kind config update is fine.
    await request(app.getHttpServer())
      .patch("/api/integrations/team-slack")
      .send({ enabled: false, config: { kind: "slack", channels: ["C123", "C999"] } })
      .expect(200)
  })

  it("delete cascades the credentials file", async () => {
    await request(app.getHttpServer()).delete("/api/integrations/team-slack/credentials").expect(200)
    // Re-add credentials then delete the integration; the cred file must be gone.
    await request(app.getHttpServer())
      .put("/api/integrations/team-slack/credentials")
      .send({ token: "xoxb-again" })
      .expect(200)
    await request(app.getHttpServer()).delete("/api/integrations/team-slack").expect(200)
    await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(404)
    await expect(
      fs.access(path.join(credentialsDir, "team-slack.json")),
    ).rejects.toThrow()
  })
})
