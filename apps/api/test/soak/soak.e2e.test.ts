import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module";
import { ChannelWatcherService } from "../../src/channels/channel-watcher.service";
import { SOAK_SCENARIOS } from "./scenarios";
import { type SoakItemView, type SoakReport, renderSoakReport, runSoak } from "./soak-harness";

const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/fake-claude.mjs",
);

/**
 * NS2 F6b — the opt-in soak lane. `ZIBBY_SOAK=1` is the ONLY switch: without it
 * the whole describe is skipped (0 tests — the meta-guard below locks that), so
 * this file is green-and-empty in CI and in the default local run. Run it via
 * `pnpm --filter @zibby/api soak`.
 *
 * The soak drives the REAL autonomous loop (watcher tick → triage → gated
 * reply/dispatch/park) against the fake adapter with the scripted scenarios and
 * fails on any gate violation: an item that should have parked but auto-sent, an
 * email that produced a reply/approval, or an unscripted auto-send. It writes a
 * markdown soak report to `SOAK_REPORT_PATH` (default: inside the temp data
 * root, so the default lane writes nothing durable).
 */
const SOAK = Boolean(process.env.ZIBBY_SOAK);

/** Counts soak test bodies that actually executed — the meta-guard's evidence. */
let soakTestsExecuted = 0;

describe.skipIf(!SOAK)("Autonomous-loop soak (opt-in, fake channels)", () => {
  let app: INestApplication;
  let root: string;
  let fakeDir: string;
  let report: SoakReport;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "soak-e2e-"));
    fakeDir = path.join(root, "fake");
    process.env.ZIBBY_DATA_DIR = root;
    process.env.CHANNEL_FAKE_DIR = fakeDir;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "2";
    process.env.FAKE_CLAUDE_DELAY_MS = "20";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const http = () => request(app.getHttpServer());
    // A non-empty catalog so the Tier-1 scenario dispatches.
    await http()
      .post("/api/agents")
      .send({
        id: "fixer",
        name: "Fixer",
        description: "fixes reported bugs",
        instructions: "Fix bugs.",
        ownerSubsystem: "forge",
      })
      .expect(201);
    await http()
      .post("/api/projects")
      .send({ id: "acme-app", name: "Acme", path: root })
      .expect(201);
    // The three scripted integrations (owned by the project; subsystem membership
    // is derived — puls listens, herald replies where mandate.reply is on).
    await http()
      .post("/api/integrations")
      .send({
        id: "team",
        kind: "slack",
        projectId: "acme-app",
        name: "Team",
        config: { kind: "slack", channels: ["C1"] },
      })
      .expect(201);
    await http().put("/api/integrations/team/credentials").send({ token: "xoxb-1" }).expect(200);
    await http()
      .post("/api/integrations")
      .send({
        id: "announcements",
        kind: "slack",
        projectId: "acme-app",
        name: "Announcements",
        config: { kind: "slack", channels: ["C2"] },
      })
      .expect(201);
    await http()
      .put("/api/integrations/announcements/credentials")
      .send({ token: "xoxb-2" })
      .expect(200);
    await http()
      .post("/api/integrations")
      .send({
        id: "support",
        kind: "email",
        projectId: "acme-app",
        name: "Support Mail",
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
    await http().put("/api/integrations/support/credentials").send({ password: "pw" }).expect(200);
    // The Tier-2 scenario needs the reply mandate ON (email ignores it — structural).
    await http()
      .put("/api/mandate")
      .send({ defaults: { dispatch: true, reply: true }, channels: {} })
      .expect(200);
    // F6a seam: (announcements, request) is already graduated to Tier-2 auto-send.
    await fs.mkdir(path.join(root, "herald"), { recursive: true });
    await fs.writeFile(
      path.join(root, "herald", "graduations.json"),
      JSON.stringify([
        {
          integrationId: "announcements",
          kind: "slack",
          category: "request",
          evidenceCount: 10,
          approvalId: "appr_seed",
          graduatedAt: "2026-07-16T00:00:00.000Z",
        },
      ]),
    );

    const watcher = app.get(ChannelWatcherService);
    report = await runSoak(SOAK_SCENARIOS, {
      fakeDir,
      tick: async () => {
        await watcher.tick();
      },
      listItems: async () =>
        (await http().get("/api/channels/items").expect(200)).body as SoakItemView[],
      ticks: Number(process.env.SOAK_TICKS) || 3,
      tickDelayMs: Number(process.env.SOAK_TICK_DELAY_MS) || 50,
    });
    const reportPath = process.env.SOAK_REPORT_PATH ?? path.join(root, "soak-report.md");
    await fs.writeFile(reportPath, renderSoakReport(report), "utf8");
    // Operator visibility when run by hand.

    console.log(`[soak] report written to ${reportPath}`);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
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

  it("no gate violation occurred across the scripted fleet", () => {
    soakTestsExecuted += 1;
    expect(report.violations).toEqual([]);
  });

  it("every scenario landed at its scripted tier and state", () => {
    soakTestsExecuted += 1;
    for (const r of report.results) {
      expect({ name: r.name, tier: r.actualTier, state: r.actualState }).toEqual({
        name: r.name,
        tier: r.expectedTier,
        state: r.expectedState,
      });
    }
  });

  it("the tier fan-out matches the script (1×T1, 3×T2, 2×T3)", () => {
    soakTestsExecuted += 1;
    expect(report.handledByTier).toEqual({ 1: 1, 2: 3, 3: 2 });
  });
});

// The 0-tests meta-assertion (binding ruling #3): when `ZIBBY_SOAK` is unset,
// NO soak test body may have executed — `skipIf` is the whole CI-safety
// mechanism, and this locks it. (Registration order guarantees this runs after
// the soak describe within the file.)
describe.runIf(!SOAK)("soak opt-in guard (meta)", () => {
  it("0 soak tests execute without ZIBBY_SOAK", () => {
    expect(soakTestsExecuted).toBe(0);
  });
});
