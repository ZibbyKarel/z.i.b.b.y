import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Automation, AutomationFire, AutomationView, RunLogChunk } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { firstValueFrom, toArray } from "rxjs";
import { AutomationFiresStore } from "./automation-fires.store";
import { AutomationFireLogsController } from "./automation-fire-logs.controller";
import { AutomationsController } from "./automations.controller";
import { AutomationNotFoundError } from "./automations.storage.service";

const automation: Automation = {
  id: "nightly",
  trigger: { type: "cron", expr: "0 3 * * *" },
  target: { type: "gap-detect" },
  enabled: true,
  system: false,
};

const storage = {
  list: async () => [automation],
  get: async (id: string) => {
    if (id !== automation.id) throw new AutomationNotFoundError(id);
    return automation;
  },
};

type Res<T> = Promise<{ status: number; body: T }>;
interface Impl {
  listAutomations: () => Res<AutomationView[]>;
  getAutomation: (a: { params: { id: string } }) => Res<AutomationView>;
  listAutomationFires: (a: { params: { id: string } }) => Res<AutomationFire[]>;
  getAutomationFireLog: (a: {
    params: { id: string; fireId: string };
    query: { offset: number };
  }) => Res<RunLogChunk>;
}

let dir: string;
let fires: AutomationFiresStore;
let impl: Impl;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "automations-controller-"));
  fires = new AutomationFiresStore(dir);
  impl = new AutomationsController(
    storage as never,
    {} as never,
    fires,
  ).handler() as unknown as Impl;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("AutomationsController — fires (todo-4)", () => {
  it("list and get carry lastFire for a fired automation", async () => {
    await fires.begin("nightly", "cron", new Date("2026-11-12T08:00:00Z"));
    const latest = await fires.begin("nightly", "manual", new Date("2026-11-12T09:00:00Z"));

    const list = await impl.listAutomations();
    expect(list.body[0]?.lastFire?.id).toBe(latest.id);
    const one = await impl.getAutomation({ params: { id: "nightly" } });
    expect(one.body.lastFire?.id).toBe(latest.id);
  });

  it("list leaves lastFire off an automation that never fired", async () => {
    expect((await impl.listAutomations()).body[0]).not.toHaveProperty("lastFire");
  });

  it("fires route returns newest first and 404s an unknown automation", async () => {
    const a = await fires.begin("nightly", "cron", new Date("2026-11-12T08:00:00Z"));
    const b = await fires.begin("nightly", "manual", new Date("2026-11-12T09:00:00Z"));

    const res = await impl.listAutomationFires({ params: { id: "nightly" } });
    expect(res.status).toBe(200);
    expect(res.body.map((f) => f.id)).toEqual([b.id, a.id]);
    expect((await impl.listAutomationFires({ params: { id: "ghost" } })).status).toBe(404);
  });

  it("log route returns the chunk and 404s an unknown or traversal fire", async () => {
    const fire = await fires.begin("nightly", "manual");
    await fires.appendLog("nightly", fire.id, "hello");

    const res = await impl.getAutomationFireLog({
      params: { id: "nightly", fireId: fire.id },
      query: { offset: 0 },
    });
    expect(res).toEqual({ status: 200, body: { content: "hello\n", nextOffset: 6, done: false } });
    for (const fireId of ["fire_missing", "../nightly"]) {
      const missing = await impl.getAutomationFireLog({
        params: { id: "nightly", fireId },
        query: { offset: 0 },
      });
      expect(missing.status).toBe(404);
    }
  });
});

describe("AutomationFireLogsController — SSE tail", () => {
  it("streams a finished fire's log then completes", async () => {
    const fire = await fires.begin("nightly", "manual");
    await fires.appendLog("nightly", fire.id, "line");
    await fires.finish("nightly", fire.id, { status: "done", result: "gaps:0" });

    const events = await firstValueFrom(
      new AutomationFireLogsController(fires)
        .streamLogs({} as never, "nightly", fire.id)
        .pipe(toArray()),
    );
    expect(events.map((e) => JSON.parse(String(e.data)))).toEqual([
      { content: "line\n", nextOffset: 5, done: true },
    ]);
  });

  it("ends cleanly (done chunk) for an unknown fire", async () => {
    const events = await firstValueFrom(
      new AutomationFireLogsController(fires)
        .streamLogs({} as never, "nightly", "fire_missing")
        .pipe(toArray()),
    );
    expect(events.map((e) => JSON.parse(String(e.data)))).toEqual([
      { content: "", nextOffset: 0, done: true },
    ]);
  });
});
