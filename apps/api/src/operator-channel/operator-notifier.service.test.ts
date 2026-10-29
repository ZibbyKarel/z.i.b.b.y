import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  ActivityEntry,
  ActivityKind,
  ActivityRefs,
  Approval,
  OperatorChannelSettingsInput,
  ScheduledTask,
  WorkflowRun,
} from "@zibby/contracts";
import { OperatorChannelSettingsSchema, OperatorEventKindSchema } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityEventsService } from "../activity/activity-events.service";
import { CredentialsStore } from "../integrations/credentials.store";
import type { LoggerService } from "../shared/logging/logger.service";
import { RateLimitedError } from "./operator-channel.port";
import { OperatorChannelService } from "./operator-channel.service";
import { OperatorChannelStore } from "./operator-channel.store";
import type { OperatorEventLookups } from "./operator-events";
import { OperatorNotifier, inQuietHours } from "./operator-notifier.service";
import { SlackOperatorChannel } from "./slack-operator-channel";

const BOT_TOKEN = "xoxb-super-secret-bot-token-123";

let seq = 0;
const entry = (
  kind: ActivityKind,
  refs: ActivityRefs,
  summary = `${kind} summary`,
): ActivityEntry => ({
  id: `act_${++seq}`,
  at: "2026-10-29T12:00:00.000Z",
  kind,
  summary,
  refs,
});

const task = (id: string, extra: Partial<ScheduledTask> = {}): ScheduledTask =>
  ({ id, title: `Task ${id}`, text: `do ${id}`, ...extra }) as ScheduledTask;

/** Stub stores: t-pr opened a PR, t-plain finished without one, t-review is a PR review. */
const lookups: OperatorEventLookups = {
  task: (id) =>
    Promise.resolve(
      id === "t-pr"
        ? task(id, {
            outcome: {
              status: "done",
              summary: "3 stages green",
              finishedAt: "2026-10-29T12:00:00.000Z",
              pr: { url: "https://github.com/acme/app/pull/7", additions: 1, deletions: 0 },
            },
          })
        : id === "t-review"
          ? task(id, {
              prReview: {
                repo: "acme/app",
                number: 9,
                url: "https://github.com/acme/app/pull/9",
                state: "awaiting-approval",
              },
            })
          : task(id, {
              outcome: { status: "done", summary: "ok", finishedAt: "2026-10-29T12:00:00.000Z" },
            }),
    ),
  approval: (id) =>
    Promise.resolve({
      id,
      runId: id === "ap-review" ? "t-review" : "t-x",
      skill: "deploy",
      action: "ship",
      detail: "why\nmore",
    } as Approval),
  workflowRun: (id) =>
    ({ workflowRunId: id, parkedReason: id === "wr-gate" ? "gate" : "retries" }) as WorkflowRun,
};

/** One activity entry per operator event kind (the acceptance table). */
const MAPPED: [string, ActivityEntry][] = [
  ["pr-opened", entry("task-outcome", { taskId: "t-pr", status: "done" })],
  ["run-completed", entry("task-outcome", { taskId: "t-plain", status: "done" })],
  [
    "review-finished",
    entry("approval-requested", { approvalId: "ap-review", status: "pr-review" }),
  ],
  [
    "budget-cap",
    entry("approval-requested", { approvalId: "ap-cap", action: "spend-past-cap", status: "task" }),
  ],
  [
    "approval-waiting",
    entry("approval-requested", { approvalId: "ap-1", action: "ship", status: "workflow" }),
  ],
  ["run-parked", entry("workflow-parked", { runRef: "wr-1", status: "parked" })],
  ["ci-red", entry("monitor-alert", { itemId: "ci-1", integrationId: "gh" })],
  ["briefing", entry("briefing-generated", { noteId: "brief-1" })],
];

interface Harness {
  notifier: OperatorNotifier;
  service: OperatorChannelService;
  store: OperatorChannelStore;
  logs: string[];
  dir: string;
}

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-notifier-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function harness(settings: OperatorChannelSettingsInput = {}): Promise<Harness> {
  const store = new OperatorChannelStore(dir);
  await store.writeSettings(
    OperatorChannelSettingsSchema.parse({
      enabled: true,
      operatorUserIds: ["U1"],
      publicBaseUrl: "https://zibby.tail1234.ts.net",
      ...settings,
      notify: { events: [...OperatorEventKindSchema.options], ...settings.notify },
    }),
  );
  const credentials = new CredentialsStore(path.join(dir, "creds"));
  const service = new OperatorChannelService(store, credentials);
  const logs: string[] = [];
  const capture = (level: string) => (message: string, meta?: Record<string, unknown>) =>
    logs.push(`${level} ${message} ${JSON.stringify(meta ?? {})}`);
  const logger = {
    child: () => ({
      debug: capture("debug"),
      info: capture("info"),
      warn: capture("warn"),
      error: capture("error"),
    }),
  } as unknown as LoggerService;
  const notifier = new OperatorNotifier(
    new ActivityEventsService(),
    store,
    service,
    lookups,
    logger,
  );
  notifier.coalesceMs = 0;
  notifier.minIntervalMs = 0;
  notifier.sleep = vi.fn(() => Promise.resolve());
  notifier.now = () => new Date("2026-10-29T12:00:00.000Z");
  return { notifier, service, store, logs, dir };
}

/** Feed one entry and settle the burst so each entry is its own message. */
async function feed(h: Harness, ...entries: ActivityEntry[]): Promise<void> {
  for (const e of entries) {
    await h.notifier.onActivity(e);
    await h.notifier.idle();
  }
}

describe("OperatorNotifier — mapping", () => {
  it.each(MAPPED)("%s: one mapped event → exactly one notification", async (kind, e) => {
    const h = await harness();
    await feed(h, e);
    expect(h.service.fake.sent).toHaveLength(1);
    expect(h.service.fake.sent[0]?.notification.kind).toBe(kind);
    const [logged] = await h.store.recentDeliveries();
    expect(logged).toMatchObject({ kind, status: "sent" });
  });

  it("a PR notification carries Open PR + Open in ZIBBY link buttons and the run summary", async () => {
    const h = await harness();
    await feed(h, MAPPED[0]![1]);
    const n = h.service.fake.sent[0]!.notification;
    expect(n.headline).toBe("PR otevřen: Task t-pr");
    expect(n.lines).toEqual(["3 stages green"]);
    expect(n.links).toEqual([
      { label: "Otevřít PR", url: "https://github.com/acme/app/pull/7" },
      { label: "Otevřít v ZIBBY", url: "https://zibby.tail1234.ts.net/work/tasks/t-pr" },
    ]);
  });

  it("renders English copy when the locale is en", async () => {
    const h = await harness({ locale: "en" });
    await feed(h, MAPPED[0]![1]);
    expect(h.service.fake.sent[0]!.notification.headline).toBe("PR opened: Task t-pr");
  });

  it("Tier-1 / unmapped activity is never sent", async () => {
    const h = await harness();
    await feed(
      h,
      entry("task-dispatched", { taskId: "t-1" }),
      entry("gate-decision", { action: "x" }),
      entry("stage-verdict", { runRef: "wr-1" }),
      entry("task-outcome", { taskId: "t-plain", status: "error" }),
      // a gate-parked run rides its approval, not a second "parked" line
      entry("workflow-parked", { runRef: "wr-gate", status: "parked" }),
      // a PR-review task's outcome reports through its approval
      entry("task-outcome", { taskId: "t-review", status: "done" }),
    );
    expect(h.service.fake.sent).toHaveLength(0);
  });

  it("nothing is sent while disabled or with the kind toggled off", async () => {
    const off = await harness({ enabled: false });
    await feed(off, MAPPED[0]![1]);
    expect(off.service.fake.sent).toHaveLength(0);

    const toggled = await harness({ notify: { events: ["ci-red"] } });
    await feed(toggled, MAPPED[0]![1]);
    expect(toggled.service.fake.sent).toHaveLength(0);
  });
});

describe("OperatorNotifier — policy", () => {
  it("dedupes an identical event (kind + target + state)", async () => {
    const h = await harness();
    const again = { ...MAPPED[6]![1], id: "act_dup" };
    await feed(h, MAPPED[6]![1], again);
    expect(h.service.fake.sent).toHaveLength(1);
  });

  it("coalesces a burst into one message, logging every item under one messageRef", async () => {
    const h = await harness();
    h.notifier.coalesceMs = 50;
    for (const [, e] of MAPPED.slice(0, 3)) await h.notifier.onActivity(e);
    await h.notifier.idle();
    expect(h.service.fake.sent).toHaveLength(1);
    const n = h.service.fake.sent[0]!.notification;
    expect(n.headline).toBe("3 novinek");
    expect(n.tier).toBe(3);
    expect(n.lines[0]).toBe("• <https://github.com/acme/app/pull/7|PR otevřen: Task t-pr>");
    const log = await h.store.recentDeliveries();
    expect(log).toHaveLength(3);
    expect(new Set(log.map((l) => l.messageRef)).size).toBe(1);
  });

  it("quiet hours hold Tier-2 back and let Tier-3 through, flagged", async () => {
    const h = await harness({
      notify: { quietHours: { from: "22:00", to: "07:00", tz: "Europe/Prague" } },
    });
    h.notifier.now = () => new Date("2026-10-29T23:30:00.000Z"); // 00:30 in Prague
    await feed(h, MAPPED[0]![1], MAPPED[4]![1]);
    expect(h.service.fake.sent).toHaveLength(1);
    const n = h.service.fake.sent[0]!.notification;
    expect(n.kind).toBe("approval-waiting");
    expect(n.lines[0]).toBe("Tiché hodiny — posílám, protože to čeká na tebe.");
    const statuses = (await h.store.recentDeliveries()).map((l) => `${l.kind}:${l.status}`);
    expect(statuses).toEqual(["approval-waiting:sent", "pr-opened:quiet-hours"]);
  });

  it("caps messages per hour; the overflow is logged, not sent", async () => {
    const h = await harness({ notify: { maxPerHour: 2 } });
    await feed(h, MAPPED[0]![1], MAPPED[1]![1], MAPPED[6]![1]);
    expect(h.service.fake.sent).toHaveLength(2);
    const [newest] = await h.store.recentDeliveries();
    expect(newest).toMatchObject({ kind: "ci-red", status: "capped" });
  });

  it("backs off on a 429 for Retry-After, then sends", async () => {
    const h = await harness();
    h.service.fake.failNext.push(new RateLimitedError(7000));
    await feed(h, MAPPED[0]![1]);
    expect(h.notifier.sleep).toHaveBeenCalledWith(7000);
    expect(h.service.fake.sent).toHaveLength(1);
  });

  it("logs a failed send without throwing into the stream", async () => {
    const h = await harness();
    h.service.fake.failNext.push(new Error("channel_not_found"));
    await feed(h, MAPPED[0]![1]);
    const [logged] = await h.store.recentDeliveries();
    expect(logged).toMatchObject({ status: "failed", detail: "channel_not_found" });
  });
});

describe("inQuietHours", () => {
  const q = { from: "22:00", to: "07:00", tz: "Europe/Prague" };
  it("wraps midnight and respects the time zone", () => {
    expect(inQuietHours(q, new Date("2026-10-29T21:30:00.000Z"))).toBe(true); // 22:30
    expect(inQuietHours(q, new Date("2026-10-29T05:59:00.000Z"))).toBe(true); // 06:59
    expect(inQuietHours(q, new Date("2026-10-29T06:00:00.000Z"))).toBe(false); // 07:00
    expect(inQuietHours(undefined, new Date())).toBe(false);
  });
});

describe("secrets", () => {
  it("the bot token never reaches the logs or the delivery log", async () => {
    const h = await harness();
    // A real Slack transport (failing with a Slack error) in place of the fake.
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const slack = new SlackOperatorChannel(BOT_TOKEN, null, fetchImpl);
    vi.spyOn(h.service, "send").mockImplementation(async (n) => {
      await slack.connect("U1").catch(() => undefined);
      return slack.send(n);
    });
    await feed(h, MAPPED[0]![1]);
    await h.notifier.sendTest();

    const deliveries = await fs.readFile(path.join(h.dir, "deliveries.jsonl"), "utf8");
    const settings = await fs.readFile(path.join(h.dir, "operator-channel.json"), "utf8");
    expect(deliveries).toContain("failed");
    expect(h.logs.join("\n")).toContain("operator notification failed");
    for (const text of [deliveries, settings, h.logs.join("\n")]) {
      expect(text).not.toContain(BOT_TOKEN);
      expect(text).not.toContain("xoxb-");
    }
    // …while the token does travel, in the authorization header only.
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]![1];
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${BOT_TOKEN}`);
    expect(String(init.body)).not.toContain(BOT_TOKEN);
  });
});
