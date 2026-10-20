import { describe, expect, it } from "vitest";
import { RunArtifactSchema, RunStatusSchema } from "../common.schema";
import { DiffstatSchema } from "../common.schema";
import { StageRunSchema } from "../workflows/workflow-run.schema";
import {
  ResumeTaskRunSchema,
  SendRunMessageSchema,
  TaskRunArtifactSchema,
  TaskRunSchema,
  TaskRunStatusSchema,
} from "./task-run.schema";

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

describe("TaskRunSchema — classification (F2c)", () => {
  it("parses a run without a classification; the field stays undefined", () => {
    const parsed = TaskRunSchema.parse(minimalRun);
    expect(parsed.classification).toBeUndefined();
  });

  it("round-trips a classification trace, including the delegated department", () => {
    const parsed = TaskRunSchema.parse({
      ...minimalRun,
      classification: {
        stage1: { kind: "department", id: "dev", name: "Dev" },
        confidence: 0.8,
        reason: "matches dev's mandate",
        matchedTerms: ["ship"],
        department: "dev",
      },
    });
    expect(parsed.classification?.department).toBe("dev");
    expect(parsed.classification?.stage1).toEqual({
      kind: "department",
      id: "dev",
      name: "Dev",
    });
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

describe("run-detail redesign schemas", () => {
  it("accepts the paused status", () => {
    expect(TaskRunStatusSchema.parse("paused")).toBe("paused");
  });

  it("SendRunMessageSchema trims and defaults the recipient", () => {
    expect(SendRunMessageSchema.parse({ text: "  hi " })).toEqual({ text: "hi", to: "all" });
    expect(SendRunMessageSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("ResumeTaskRunSchema rejects an unknown mode", () => {
    expect(ResumeTaskRunSchema.safeParse({ mode: "bogus" }).success).toBe(false);
    expect(ResumeTaskRunSchema.parse({ mode: "fresh" }).mode).toBe("fresh");
  });

  it("StageRunSchema keeps start/finish times", () => {
    const s = StageRunSchema.parse({
      phaseId: "p",
      runId: "r",
      attempt: 1,
      status: "done",
      startedAt: "2026-10-20T10:00:00Z",
      finishedAt: "2026-10-20T10:02:00Z",
    });
    expect(s.startedAt).toBe("2026-10-20T10:00:00Z");
    expect(s.finishedAt).toBe("2026-10-20T10:02:00Z");
  });

  it("DiffstatSchema rejects a negative count", () => {
    expect(DiffstatSchema.safeParse({ files: [], additions: -1, deletions: 0 }).success).toBe(
      false,
    );
  });
});
