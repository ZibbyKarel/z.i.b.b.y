import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("System config API (e2e)", () => {
  let app: INestApplication;
  let configFile: string;

  beforeAll(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "system-e2e-"));
    configFile = path.join(dir, "system-config.json");
    // Own config file (no seed) so GET exercises the schema-default path.
    process.env.SYSTEM_CONFIG_FILE = configFile;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(path.dirname(configFile), { recursive: true, force: true });
    delete process.env.SYSTEM_CONFIG_FILE;
  });

  it("GET returns the schema defaults when no file exists", async () => {
    const res = await request(app.getHttpServer()).get("/api/system/config").expect(200);
    expect(res.body).toMatchObject({
      taskTickMs: 30_000,
      channelTickMs: 30_000,
      automationTickMs: 0,
      limitResumeTickMs: 60_000,
      limitResumeMax: 3,
      goalVerifyTimeoutMs: 600_000,
      goalAutoResume: false,
    });
  });

  it("PUT replaces the config and persists it", async () => {
    await request(app.getHttpServer())
      .put("/api/system/config")
      .send({
        taskTickMs: 0,
        channelTickMs: 0,
        automationTickMs: 0,
        limitResumeTickMs: 0,
        limitResumeMax: 5,
        goalVerifyTimeoutMs: 120_000,
        goalAutoResume: true,
      })
      .expect(200);

    const res = await request(app.getHttpServer()).get("/api/system/config").expect(200);
    expect(res.body.limitResumeMax).toBe(5);
    expect(res.body.goalAutoResume).toBe(true);
    // Persisted to disk.
    const onDisk = JSON.parse(await fs.readFile(configFile, "utf8"));
    expect(onDisk.goalVerifyTimeoutMs).toBe(120_000);
  });

  // The contract body is the strict schema itself, so ts-rest rejects a malformed
  // body at the request boundary with 400 (same posture as research/budget config).
  it("PUT rejects an unknown key at the contract boundary (.strict → 400)", async () => {
    await request(app.getHttpServer())
      .put("/api/system/config")
      .send({
        taskTickMs: 0,
        channelTickMs: 0,
        automationTickMs: 0,
        limitResumeTickMs: 0,
        limitResumeMax: 3,
        goalVerifyTimeoutMs: 600_000,
        goalAutoResume: false,
        sneaky: true,
      })
      .expect(400);
  });

  it("PUT rejects a negative tick with 400", async () => {
    await request(app.getHttpServer())
      .put("/api/system/config")
      .send({
        taskTickMs: -1,
        channelTickMs: 0,
        automationTickMs: 0,
        limitResumeTickMs: 0,
        limitResumeMax: 3,
        goalVerifyTimeoutMs: 600_000,
        goalAutoResume: false,
      })
      .expect(400);
  });
});
