import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { ActivityEventsService } from "./activity-events.service";
import { ActivityLogService } from "./activity-log.service";

describe("ActivityLogService", () => {
  let dir: string;
  let trace: TraceContextService;
  let events: ActivityEventsService;
  let service: ActivityLogService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "activity-"));
    trace = new TraceContextService();
    events = new ActivityEventsService();
    service = new ActivityLogService(dir, trace, events);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function readLines(date: string): Promise<string[]> {
    const raw = await fs.readFile(path.join(dir, `${date}.jsonl`), "utf8");
    return raw.split("\n").filter((l) => l.trim().length > 0);
  }

  it("appends exactly one valid JSONL line per record", async () => {
    const now = new Date("2026-06-12T07:00:00.000Z");
    await service.record({ kind: "task-created", summary: "a" }, now);
    await service.record({ kind: "task-dispatched", summary: "b" }, now);
    const lines = await readLines("2026-06-12");
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(lines[0]!).kind).toBe("task-created");
  });

  it("rotates files on the day boundary (date from injected now)", async () => {
    await service.record(
      { kind: "run-started", summary: "late" },
      new Date("2026-06-12T23:59:59.900Z"),
    );
    await service.record(
      { kind: "run-finished", summary: "early" },
      new Date("2026-06-13T00:00:00.100Z"),
    );
    expect(await readLines("2026-06-12")).toHaveLength(1);
    expect(await readLines("2026-06-13")).toHaveLength(1);
  });

  it("reads tolerantly — a torn last line and a garbage line are skipped", async () => {
    const now = new Date("2026-06-12T07:00:00.000Z");
    await service.record({ kind: "task-created", summary: "good" }, now);
    // Append a garbage line and a torn (incomplete) JSON line directly.
    await fs.appendFile(path.join(dir, "2026-06-12.jsonl"), 'not json\n{"id":"x","at":', "utf8");
    const entries = await service.list({ date: "2026-06-12" }, now);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.summary).toBe("good");
  });

  it("filters by kind and caps with limit, newest-first", async () => {
    const now = new Date("2026-06-12T07:00:00.000Z");
    await service.record({ kind: "task-created", summary: "1" }, now);
    await service.record({ kind: "gate-decision", summary: "2" }, now);
    await service.record({ kind: "task-created", summary: "3" }, now);

    const onlyTasks = await service.list({ date: "2026-06-12", kinds: ["task-created"] }, now);
    expect(onlyTasks.map((e) => e.summary)).toEqual(["3", "1"]); // newest-first

    const capped = await service.list({ date: "2026-06-12", limit: 1 }, now);
    expect(capped).toHaveLength(1);
    expect(capped[0]!.summary).toBe("3");
  });

  it("readSince spans yesterday + today and filters by timestamp", async () => {
    const now = new Date("2026-06-13T08:00:00.000Z");
    await service.record(
      { kind: "task-created", summary: "yesterday-early" },
      new Date("2026-06-12T06:00:00.000Z"),
    );
    await service.record(
      { kind: "task-created", summary: "yesterday-late" },
      new Date("2026-06-12T20:00:00.000Z"),
    );
    await service.record(
      { kind: "task-created", summary: "today" },
      new Date("2026-06-13T07:00:00.000Z"),
    );

    const since = await service.readSince("2026-06-12T12:00:00.000Z", now);
    expect(since.map((e) => e.summary)).toEqual(["today", "yesterday-late"]); // newest-first, early dropped
  });

  it("stamps traceId/runId from the active ALS scope", async () => {
    const now = new Date("2026-06-12T07:00:00.000Z");
    await trace.run({ traceId: "trace-1", runId: "run-1" }, () =>
      service.record({ kind: "run-started", summary: "scoped" }, now),
    );
    const [entry] = await service.list({ date: "2026-06-12" }, now);
    expect(entry!.traceId).toBe("trace-1");
    expect(entry!.runId).toBe("run-1");
  });

  it("never throws when the dir is unwritable (accountability never breaks actuation)", async () => {
    // Point the dir at a path under a regular file so ensureDir/appendFile fail.
    const file = path.join(dir, "afile");
    await fs.writeFile(file, "x");
    const broken = new ActivityLogService(path.join(file, "nested"), trace, events);
    await expect(broken.record({ kind: "task-created", summary: "boom" })).resolves.toBeUndefined();
  });
});
