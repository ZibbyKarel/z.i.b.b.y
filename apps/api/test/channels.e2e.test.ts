import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"
import { ChannelWatcherService } from "../src/channels/channel-watcher.service"

/** Seed a fixture message under the fake dir for an integration. */
async function seed(fakeDir: string, integrationId: string, name: string, text: string) {
  const dir = path.join(fakeDir, integrationId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, name), JSON.stringify({ text, receivedAt: "2026-06-12T00:00:00.000Z" }))
}

async function boot() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication()
  await app.init()
  return app
}

describe("Channels ingestion (e2e)", () => {
  let app: INestApplication
  let root: string
  let fakeDir: string

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "channels-e2e-"))
    fakeDir = path.join(root, "fake")
    process.env.INTEGRATIONS_DIR = path.join(root, "integrations")
    process.env.CREDENTIALS_DIR = path.join(root, "credentials")
    process.env.CHANNELS_DIR = path.join(root, "channels")
    process.env.CHANNEL_FAKE_DIR = fakeDir
    process.env.CHANNEL_ADAPTER_MODE = "fake"
    process.env.CHANNEL_TICK_MS = "0"
    process.env.AUTOMATION_TICK_MS = "0"
    process.env.TASK_TICK_MS = "0"

    app = await boot()
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({ id: "team-slack", kind: "slack", config: { kind: "slack", channels: ["C1"] } })
      .expect(201)
    await request(app.getHttpServer())
      .put("/api/integrations/team-slack/credentials")
      .send({ token: "xoxb-1" })
      .expect(200)
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(root, { recursive: true, force: true })
    for (const k of [
      "INTEGRATIONS_DIR",
      "CREDENTIALS_DIR",
      "CHANNELS_DIR",
      "CHANNEL_FAKE_DIR",
      "CHANNEL_ADAPTER_MODE",
      "CHANNEL_TICK_MS",
      "AUTOMATION_TICK_MS",
      "TASK_TICK_MS",
    ]) {
      delete process.env[k]
    }
  })

  it("a tick ingests fixture messages as normalized `new` items", async () => {
    await seed(fakeDir, "team-slack", "001.json", "the app crashes on login")
    await seed(fakeDir, "team-slack", "002.json", "can you share a status?")

    const watcher = app.get(ChannelWatcherService)
    const ids = await watcher.tick()
    expect(ids.length).toBe(2)

    const items = await request(app.getHttpServer())
      .get("/api/channels/items?integrationId=team-slack")
      .expect(200)
    expect(items.body.map((i: { text: string }) => i.text)).toContain("the app crashes on login")
    expect(items.body.every((i: { state: string }) => i.state === "new")).toBe(true)

    // get-by-id resolves through the two-level store.
    const one = items.body[0]
    await request(app.getHttpServer()).get(`/api/channels/items/${one.id}`).expect(200)
  })

  it("a restart over the same data dir does not duplicate (dedup + cursor)", async () => {
    await app.close()
    app = await boot()

    const watcher = app.get(ChannelWatcherService)
    await watcher.tick()

    const items = await request(app.getHttpServer())
      .get("/api/channels/items?integrationId=team-slack")
      .expect(200)
    // Still exactly one item per fixture — cursor honored AND id-dedup as the net.
    expect(items.body.length).toBe(2)
  })
})
