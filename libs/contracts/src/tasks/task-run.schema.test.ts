import { describe, expect, it } from "vitest";
import { TaskRunSchema } from "./task-run.schema";

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
