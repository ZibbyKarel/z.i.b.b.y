import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ChannelWatcherService } from "../src/channels/channel-watcher.service";

const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await sleep(40);
  }
}

/** Seed a fixture message under the fake dir for an integration. */
async function seed(fakeDir: string, integrationId: string, name: string, text: string) {
  const dir = path.join(fakeDir, integrationId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, name),
    JSON.stringify({ text, receivedAt: "2026-06-12T00:00:00.000Z" }),
  );
}

async function boot() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe("Channels triage throughline (e2e)", () => {
  let app: INestApplication;
  let root: string;
  let fakeDir: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "channels-flow-e2e-"));
    fakeDir = path.join(root, "fake");
    // One data root isolates every store (integrations, credentials, channels,
    // approvals, tasks, agents, mandate, policy floor).
    process.env.ZIBBY_DATA_DIR = root;
    process.env.CHANNEL_FAKE_DIR = fakeDir;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "2";
    process.env.FAKE_CLAUDE_DELAY_MS = "20";

    app = await boot();
    // A non-empty catalog so a Tier-1 task dispatches instead of failing.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "fixer",
        name: "Fixer",
        description: "fixes reported bugs",
        instructions: "Fix bugs.",
        ownerSubsystem: "forge",
      })
      .expect(201);
    // Integrations are owned by a project; create one so the FK check passes.
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "acme-app", name: "Acme", path: root })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "team",
        kind: "slack",
        projectId: "acme-app",
        name: "Team",
        config: { kind: "slack", channels: ["C1"] },
        ownerSubsystem: "puls",
      })
      .expect(201);
    await request(app.getHttpServer())
      .put("/api/integrations/team/credentials")
      .send({ token: "xoxb-1" })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
    for (const k of [
      "ZIBBY_DATA_DIR",
      "CHANNEL_FAKE_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
    ]) {
      delete process.env[k];
    }
  });

  const items = () => request(app.getHttpServer()).get("/api/channels/items").expect(200);
  const findItem = async (pred: (i: { text: string }) => boolean) =>
    (await items()).body.find(pred);

  it("Tier 1 bug report → task dispatched, item handled, outcome reconciled", async () => {
    await seed(fakeDir, "team", "001.json", "The app crashes on login with a stack trace");
    const watcher = app.get(ChannelWatcherService);
    await watcher.tick();

    const handled = await findItem((i) => i.text.includes("crashes on login"));
    expect(handled.state).toBe("handled");
    expect(handled.taskId).toBeTruthy();
    expect(handled.triage.tier).toBe(1);

    // Once the dispatched run finishes, a later tick sweeps the outcome onto the item.
    const withOutcome = await until(async () => {
      await watcher.tick();
      const found = (await items()).body.find((i: { id: string }) => i.id === handled.id);
      return found?.outcome ? found : null;
    });
    expect(["done", "error"]).toContain(withOutcome.outcome.status);
  });

  it("Tier 2 question with reply mandate ON → reply sent (recorded by the fake adapter)", async () => {
    // Opt the channel into autonomous replies.
    await request(app.getHttpServer())
      .put("/api/mandate")
      .send({ defaults: { dispatch: true, reply: true }, channels: {} })
      .expect(200);

    await seed(fakeDir, "team", "002.json", "Can you share the latest status?");
    await app.get(ChannelWatcherService).tick();

    const item = await findItem((i) => i.text.includes("share the latest status"));
    expect(item.triage.tier).toBe(2);
    expect(item.state).toBe("handled");
    expect(item.reply?.text).toBeTruthy();

    // The fake adapter recorded the outbound reply.
    const sent = await fs.readdir(path.join(fakeDir, "sent"));
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it("PUT /api/mandate rejects unknown keys (422)", async () => {
    await request(app.getHttpServer())
      .put("/api/mandate")
      .send({ defaults: { dispatch: true, reply: true }, channels: {}, sneaky: true })
      .expect(422);
  });

  it("Tier 3 scope request → channel approval pending → approve → reply sent + item handled", async () => {
    await seed(fakeDir, "team", "003.json", "Tady je nabídka a smlouva s deadline");
    await app.get(ChannelWatcherService).tick();

    const triaged = await findItem((i) => i.text.includes("nabídka"));
    expect(triaged.triage.tier).toBe(3);
    expect(triaged.state).toBe("triaged");
    expect(triaged.approvalId).toBeTruthy();

    // A kind-"channel" approval is pending.
    const pending = await request(app.getHttpServer())
      .get("/api/approvals?status=pending")
      .expect(200);
    const approval = pending.body.find((a: { kind: string }) => a.kind === "channel");
    expect(approval).toBeTruthy();

    const sentBefore = (await fs.readdir(path.join(fakeDir, "sent")).catch(() => [])).length;
    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/approve`).expect(200);

    // Approving routes back to the channel runner → draft sent, item handled.
    await until(async () => {
      const found = (await items()).body.find((i: { id: string }) => i.id === triaged.id);
      return found?.state === "handled" ? found : null;
    });
    const sentAfter = (await fs.readdir(path.join(fakeDir, "sent")).catch(() => [])).length;
    expect(sentAfter).toBe(sentBefore + 1);

    // Phase 6.1: the channel throughline left a traceable activity record —
    // ingestion (channel-item), the triage verdict, and the parked approval.
    const log = (
      await request(app.getHttpServer()).get("/api/activity").query({ limit: 500 }).expect(200)
    ).body as Array<{
      kind: string;
      refs: { itemId?: string };
    }>;
    const forItem = log.filter((e) => e.refs.itemId === triaged.id).map((e) => e.kind);
    expect(forItem).toContain("channel-item");
    expect(forItem).toContain("channel-triage");
    expect(forItem).toContain("channel-approval");
  });

  it("rejecting a channel approval ignores the item", async () => {
    await seed(fakeDir, "team", "004.json", "Another nabídka with a smlouva");
    await app.get(ChannelWatcherService).tick();
    const triaged = await findItem((i) => i.text.includes("Another nabídka"));

    const pending = await request(app.getHttpServer())
      .get("/api/approvals?status=pending")
      .expect(200);
    const approval = pending.body.find(
      (a: { kind: string; runId: string }) =>
        a.kind === "channel" && a.runId === `team/${triaged.id}`,
    );
    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/reject`).expect(200);

    await until(async () => {
      const found = (await items()).body.find((i: { id: string }) => i.id === triaged.id);
      return found?.state === "ignored" ? found : null;
    });
  });

  // Email is notify-only: ZIBBY NEVER dispatches a run or auto-replies for inbound mail.
  // An actionable email is surfaced (state `triaged`, no approval, no reply) for the
  // operator, who dismisses it once handled. This is the gate applied to a firehose —
  // the operator acts, ZIBBY only flags what needs them.
  it("email is notify-only: actionable mail is surfaced (no task, no reply, no approval), then dismissed", async () => {
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "support",
        kind: "email",
        projectId: "acme-app",
        name: "Support Mail",
        ownerSubsystem: "puls",
        config: {
          kind: "email",
          imapHost: "imap.x",
          imapPort: 993,
          smtpHost: "smtp.x",
          smtpPort: 465,
          user: "bot@x.com",
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .put("/api/integrations/support/credentials")
      .send({ password: "pw" })
      .expect(200);
    // mandate.reply is already true from the slack Tier-2 test above — yet email STILL
    // never replies, because notify-only is structural, not a mandate setting.

    const sentBefore = (await fs.readdir(path.join(fakeDir, "sent")).catch(() => [])).length;
    await seed(fakeDir, "support", "001.json", "Can you share the latest status please?");
    await app.get(ChannelWatcherService).tick();

    const item = await findItem((i) => i.text.includes("share the latest status please"));
    // Surfaced for the operator — never dispatched, never replied, never parked.
    expect(item.state).toBe("triaged");
    expect(item.reply).toBeFalsy();
    expect(item.taskId).toBeFalsy();
    expect(item.approvalId).toBeFalsy();

    const pending = await request(app.getHttpServer())
      .get("/api/approvals?status=pending")
      .expect(200);
    const channelApproval = pending.body.find(
      (a: { kind: string; runId: string }) =>
        a.kind === "channel" && a.runId === `support/${item.id}`,
    );
    expect(channelApproval).toBeFalsy();
    // No outbound mail was sent.
    const sentAfter = (await fs.readdir(path.join(fakeDir, "sent")).catch(() => [])).length;
    expect(sentAfter).toBe(sentBefore);

    // Operator dismisses it → leaves the "needs attention" list (state `ignored`).
    const dismissed = await request(app.getHttpServer())
      .post(`/api/channels/items/${item.id}/dismiss`)
      .expect(200);
    expect(dismissed.body.state).toBe("ignored");
  });

  it("a restart over the same data dir does not re-ingest (dedup + cursor)", async () => {
    const before = (await items()).body.length;
    await app.close();
    app = await boot();
    await app.get(ChannelWatcherService).tick();
    const after = (await items()).body.length;
    expect(after).toBe(before);
  });
});
