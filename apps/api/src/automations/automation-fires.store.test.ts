import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AUTOMATION_FIRES_KEEP } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationFireNotFoundError, AutomationFiresStore } from "./automation-fires.store";

let dir: string;
let store: AutomationFiresStore;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "automation-fires-"));
  store = new AutomationFiresStore(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const at = (ms: number) => new Date(Date.UTC(2026, 10, 12, 8, 0, 0) + ms);

describe("AutomationFiresStore", () => {
  it("begin → finish roundtrip records status, duration and result", async () => {
    const fire = await store.begin("nightly", "cron", at(0));
    expect(fire).toMatchObject({ automationId: "nightly", source: "cron", status: "running" });
    expect(fire.id).toMatch(/^fire_\d+_[0-9a-f]{6}$/);

    const done = await store.finish(
      "nightly",
      fire.id,
      { status: "done", result: "gaps:2" },
      at(1500),
    );
    expect(done).toMatchObject({ status: "done", result: "gaps:2", durationMs: 1500 });
    expect(done.finishedAt).toBe(at(1500).toISOString());
    expect(await store.latest("nightly")).toEqual(done);
  });

  it("lists newest startedAt first", async () => {
    const a = await store.begin("nightly", "cron", at(0));
    const b = await store.begin("nightly", "manual", at(2000));
    const c = await store.begin("nightly", "signal", at(1000));
    expect((await store.list("nightly")).map((f) => f.id)).toEqual([b.id, c.id, a.id]);
  });

  it("returns an empty list for an automation that never fired", async () => {
    expect(await store.list("never")).toEqual([]);
    expect(await store.latest("never")).toBeUndefined();
  });

  it(`prunes beyond ${AUTOMATION_FIRES_KEEP} fires (json and log removed)`, async () => {
    const ids: string[] = [];
    for (let i = 0; i < AUTOMATION_FIRES_KEEP + 2; i++) {
      const fire = await store.begin("nightly", "cron", at(i * 1000));
      await store.finish("nightly", fire.id, { status: "done" }, at(i * 1000 + 1));
      ids.push(fire.id);
    }
    const kept = await store.list("nightly");
    expect(kept).toHaveLength(AUTOMATION_FIRES_KEEP);
    expect(kept.map((f) => f.id)).not.toContain(ids[0]);
    expect(kept.map((f) => f.id)).not.toContain(ids[1]);
    const files = await fs.readdir(path.join(dir, "nightly"));
    expect(files).toHaveLength(AUTOMATION_FIRES_KEEP * 2);
  });

  it("reads the log by offset; done once the fire is no longer running", async () => {
    const fire = await store.begin("nightly", "manual", at(0));
    await store.appendLog("nightly", fire.id, "start");
    await store.appendLog("nightly", fire.id, "next");

    const first = await store.readLog("nightly", fire.id, 0);
    expect(first).toEqual({ content: "start\nnext\n", nextOffset: 11, done: false });
    expect(await store.readLog("nightly", fire.id, 6)).toEqual({
      content: "next\n",
      nextOffset: 11,
      done: false,
    });

    await store.finish("nightly", fire.id, { status: "error", error: "boom" }, at(10));
    expect(await store.readLog("nightly", fire.id, 11)).toEqual({
      content: "",
      nextOffset: 11,
      done: true,
    });
  });

  it("rejects traversal ids and unknown fires as not-found", async () => {
    await expect(store.readLog("../x", "fire_1", 0)).rejects.toBeInstanceOf(
      AutomationFireNotFoundError,
    );
    await expect(store.readLog("nightly", "../x", 0)).rejects.toBeInstanceOf(
      AutomationFireNotFoundError,
    );
    await expect(store.readLog("nightly", "fire_missing", 0)).rejects.toBeInstanceOf(
      AutomationFireNotFoundError,
    );
    await expect(store.list("../x")).resolves.toEqual([]);
  });

  it("skips a corrupt record in the list and 404s its log", async () => {
    const good = await store.begin("nightly", "cron", at(0));
    await fs.writeFile(path.join(dir, "nightly", "fire_9_aaaaaa.json"), "{not json");
    await fs.writeFile(path.join(dir, "nightly", "fire_9_aaaaaa.log"), "x\n");
    expect((await store.list("nightly")).map((f) => f.id)).toEqual([good.id]);
    await expect(store.readLog("nightly", "fire_9_aaaaaa", 0)).rejects.toBeInstanceOf(
      AutomationFireNotFoundError,
    );
  });

  it("emits change on begin/finish and log-append per fire", async () => {
    const changes: string[] = [];
    store.onChange((e) => changes.push(`${e.automationId}:${e.status}`));
    const fire = await store.begin("nightly", "cron", at(0));
    let appended = 0;
    const off = store.onLogAppend(fire.id, () => appended++);
    await store.appendLog("nightly", fire.id, "a");
    off();
    await store.appendLog("nightly", fire.id, "b");
    await store.finish("nightly", fire.id, { status: "done" }, at(5));
    expect(changes).toEqual(["nightly:running", "nightly:done"]);
    expect(appended).toBe(1);
  });

  it("never prunes a fire that is still running", async () => {
    const running = await store.begin("nightly", "cron", at(0));
    for (let i = 1; i <= AUTOMATION_FIRES_KEEP + 1; i++) {
      const fire = await store.begin("nightly", "cron", at(i * 1000));
      await store.finish("nightly", fire.id, { status: "done" }, at(i * 1000 + 1));
    }
    expect((await store.list("nightly")).map((f) => f.id)).toContain(running.id);
  });

  it("reconcile marks fires left running by a crash as interrupted errors", async () => {
    const stuck = await store.begin("nightly", "cron", at(0));
    const done = await store.begin("other", "manual", at(0));
    await store.finish("other", done.id, { status: "done" }, at(10));

    await new AutomationFiresStore(dir).reconcile(at(5000));

    expect(await store.latest("nightly")).toMatchObject({
      id: stuck.id,
      status: "error",
      error: "interrupted (process restart)",
      finishedAt: at(5000).toISOString(),
      durationMs: 5000,
    });
    expect(await store.latest("other")).toMatchObject({ status: "done", durationMs: 10 });
  });
});
