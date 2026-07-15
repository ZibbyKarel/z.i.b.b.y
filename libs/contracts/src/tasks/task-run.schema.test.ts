import { describe, expect, it } from "vitest";
import { RunArtifactSchema, RunStatusSchema } from "../common.schema";
import { TaskRunArtifactSchema, TaskRunSchema, TaskRunStatusSchema } from "./task-run.schema";

/** The minimal valid TaskRun — every required (non-optional) field, nothing else. */
const minimalRun = {
  runId: "run_1",
  kind: "agent" as const,
  owner: "writer",
  status: "running" as const,
  pct: null,
  title: "",
  prompt: "",
  project: "z.i.b.b.y",
  startedAt: new Date("2026-07-03T10:00:00Z").toISOString(),
  logBase: null,
};

describe("TaskRunSchema — attachments", () => {
  it("parses a run without attachments; the field stays undefined", () => {
    const parsed = TaskRunSchema.parse(minimalRun);
    expect(parsed.attachments).toBeUndefined();
  });

  it("round-trips a run carrying attachments", () => {
    const parsed = TaskRunSchema.parse({
      ...minimalRun,
      attachments: [{ name: "a.txt", size: 2 }],
    });
    expect(parsed.attachments).toEqual([{ name: "a.txt", size: 2 }]);
  });
});

describe("TaskRunSchema — attachmentSetId (Phase 65)", () => {
  it("parses a run without an attachmentSetId; the field stays undefined", () => {
    const parsed = TaskRunSchema.parse(minimalRun);
    expect(parsed.attachmentSetId).toBeUndefined();
  });

  it("round-trips an attachment set id, alongside its attachments", () => {
    const parsed = TaskRunSchema.parse({
      ...minimalRun,
      attachments: [{ name: "a.txt", size: 2 }],
      attachmentSetId: "set_abc",
    });
    expect(parsed.attachmentSetId).toBe("set_abc");
  });
});

describe("TaskRunSchema — sessionId (Phase 49)", () => {
  it("parses a run without a sessionId; the field stays undefined", () => {
    const parsed = TaskRunSchema.parse(minimalRun);
    expect(parsed.sessionId).toBeUndefined();
  });

  it("round-trips a captured claude session id (enables --resume re-run)", () => {
    const parsed = TaskRunSchema.parse({ ...minimalRun, sessionId: "sess-7" });
    expect(parsed.sessionId).toBe("sess-7");
  });
});

describe("T11 finding #28 — TaskRunStatusSchema derives from RunStatusSchema.options", () => {
  it("includes every shared RunStatus value plus the 5 task-run-only extra states", () => {
    for (const status of RunStatusSchema.options) {
      expect(TaskRunStatusSchema.options).toContain(status);
    }
    for (const extra of ["scheduled", "parked", "held", "queued", "pending"]) {
      expect(TaskRunStatusSchema.options).toContain(extra);
    }
  });

  it("rejects an unknown status", () => {
    expect(TaskRunStatusSchema.safeParse("exploded").success).toBe(false);
  });
});

describe("T11 finding #29 — TaskRunArtifactSchema is the shared RunArtifactSchema", () => {
  it("is the shared common.schema export (identity), proving the dedup happened", () => {
    expect(TaskRunArtifactSchema).toBe(RunArtifactSchema);
  });
});
