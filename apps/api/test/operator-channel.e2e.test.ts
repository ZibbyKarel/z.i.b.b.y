import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActivityLogService } from "../src/activity/activity-log.service";
import { AppModule } from "../src/app.module";
import { OperatorChannelService } from "../src/operator-channel/operator-channel.service";
import { OperatorNotifier } from "../src/operator-channel/operator-notifier.service";
import { withOperator } from "./operator-token";

const BOT_TOKEN = "xoxb-e2e-secret-token";

describe("Operator channel API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let credsDir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-channel-e2e-"));
    credsDir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-channel-creds-"));
    process.env.OPERATOR_CHANNEL_DIR = dir;
    process.env.CREDENTIALS_DIR = credsDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const notifier = app.get(OperatorNotifier);
    notifier.coalesceMs = 0;
    notifier.minIntervalMs = 0;
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(credsDir, { recursive: true, force: true });
    delete process.env.OPERATOR_CHANNEL_DIR;
    delete process.env.CREDENTIALS_DIR;
  });

  const server = () => app.getHttpServer();

  it("GET status reports the disabled default on the fake transport", async () => {
    const res = await request(server()).get("/api/operator-channel/status").expect(200);
    expect(res.body).toMatchObject({
      enabled: false,
      transport: "slack",
      mode: "fake",
      credentials: { bot: false, app: false },
      connected: false,
      dmResolved: false,
    });
  });

  it("mutations need the operator token", async () => {
    await request(server()).put("/api/operator-channel/settings").send({}).expect(401);
    await request(server()).post("/api/operator-channel/test").expect(401);
  });

  it("PUT settings rejects unknown keys and a client-set dmChannelId with 422", async () => {
    await withOperator(request(server()).put("/api/operator-channel/settings"))
      .send({ enabled: true, sneaky: 1 })
      .expect(422);
    await withOperator(request(server()).put("/api/operator-channel/settings"))
      .send({ dmChannelId: "D1" })
      .expect(422);
  });

  it("PUT credentials refuses a mismatched token and never echoes or stores it in settings", async () => {
    await withOperator(request(server()).put("/api/operator-channel/credentials/slack-bot"))
      .send({ token: "xapp-wrong-slot" })
      .expect(422);
    const res = await withOperator(
      request(server()).put("/api/operator-channel/credentials/slack-bot"),
    )
      .send({ token: BOT_TOKEN })
      .expect(200);
    expect(res.body.credentials).toEqual({ bot: true, app: false });
    expect(JSON.stringify(res.body)).not.toContain(BOT_TOKEN);
    const stored = await fs.readFile(
      path.join(credsDir, "operator-channel", "slack-bot.json"),
      "utf8",
    );
    expect(stored).toContain(BOT_TOKEN);
  });

  it("PUT settings + POST test sends to the resolved DM and logs the delivery", async () => {
    const put = await withOperator(request(server()).put("/api/operator-channel/settings"))
      .send({ enabled: true, operatorUserIds: ["U123"], locale: "en" })
      .expect(200);
    expect(put.body.notify.events).toContain("pr-opened");

    const test = await withOperator(request(server()).post("/api/operator-channel/test")).expect(
      200,
    );
    expect(test.body.ok).toBe(true);

    const fake = app.get(OperatorChannelService).fake;
    expect(fake.sent.at(-1)?.notification.headline).toBe(
      "Test message from ZIBBY — the channel works.",
    );

    const status = await request(server()).get("/api/operator-channel/status").expect(200);
    expect(status.body).toMatchObject({ connected: true, workspace: "fake", dmResolved: true });
    expect(status.body.lastDelivery).toMatchObject({ kind: "test", status: "sent" });

    const settings = await request(server()).get("/api/operator-channel/settings").expect(200);
    expect(settings.body.dmChannelId).toBe("D-FAKE-U123");
    for (const file of ["operator-channel.json", "deliveries.jsonl"]) {
      expect(await fs.readFile(path.join(dir, file), "utf8")).not.toContain(BOT_TOKEN);
    }
  });

  it("an existing activity event reaches the operator DM exactly once", async () => {
    const fake = app.get(OperatorChannelService).fake;
    const before = fake.sent.length;
    const activity = app.get(ActivityLogService);
    const e = {
      kind: "monitor-alert" as const,
      summary: "CI red on main",
      refs: { itemId: "ci-e2e" },
    };
    await activity.record(e);
    await activity.record(e);
    await app.get(OperatorNotifier).idle();
    expect(fake.sent.length - before).toBe(1);
    expect(fake.sent.at(-1)?.notification.headline).toBe("CI is red — fixing it: CI red on main");
  });
});
