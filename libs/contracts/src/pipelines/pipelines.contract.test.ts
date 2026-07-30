import { describe, expect, it } from "vitest";
import { AgentIdSchema } from "../agents/agent.schema";
import { RunArtifactSchema, RunStatusSchema } from "../common.schema";
import { StageRunStatusSchema } from "./pipeline-run.schema";
import { PipelineIdSchema } from "./pipeline.schema";
import { PipelineRunArtifactSchema } from "./pipelines.contract";
import {
  PIPELINE_COMPLEXITY_ORDER,
  PipelineComplexitySchema,
  PipelineRunSchema,
  PipelineSchema,
  pipelineRunsContract,
  pipelinesContract,
} from "../index";

const phase = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent: "writer",
  consumes: "in.md",
  produces: "out.md",
  model: "sonnet",
  thinking: "medium",
  ...extra,
});

describe("pipelinesContract", () => {
  it("exposes CRUD and keeps only the catalog-liveness run list", () => {
    expect(pipelinesContract.createPipeline.path).toBe("/api/pipelines");
    expect(pipelinesContract.getPipeline.path).toBe("/api/pipelines/:id");
    expect(pipelineRunsContract.listPipelineRuns.path).toBe("/api/pipelines/runs");
    // The per-kind run lifecycle routes moved to the unified `taskRuns` contract.
    expect(pipelineRunsContract).not.toHaveProperty("startPipelineRun");
    expect(pipelineRunsContract).not.toHaveProperty("listAllPipelineRuns");
    expect(pipelineRunsContract).not.toHaveProperty("getPipelineRun");
    expect(pipelineRunsContract).not.toHaveProperty("resumePipelineRun");
    expect(pipelineRunsContract).not.toHaveProperty("getStageRunLogs");
    expect(pipelineRunsContract).not.toHaveProperty("getPipelineRunArtifact");
    expect(pipelineRunsContract).not.toHaveProperty("deletePipelineRun");
  });
});

describe("pipeline schema", () => {
  it("accepts a valid linear pipeline", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a"), phase("b")],
      instructions: "ship it",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a tester loop whose targets exist", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [
        phase("build"),
        phase("test", { loop: { to: "build", maxRetries: 2, escalate: true, then: "fail" } }),
      ],
      instructions: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a dangling loop target (superRefine)", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [
        phase("build", { loop: { to: "nope", maxRetries: 1, escalate: false, then: "fail" } }),
      ],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate phase ids", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("dup"), phase("dup")],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one phase", () => {
    expect(PipelineSchema.safeParse({ id: "x", phases: [], instructions: "y" }).success).toBe(
      false,
    );
  });

  it("defaults outputs to an empty array (older pipelines parse unchanged)", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      instructions: "x",
    });
    expect(result.success && result.data.outputs).toEqual([]);
  });

  it("accepts pr + file output sinks drawing from a produced artifact", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [
        { type: "pr", from: "out.md" },
        { type: "file", from: "out.md", dest: "vault", to: "note-1" },
      ],
      instructions: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an output.from that no phase produces (superRefine)", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [{ type: "pr", from: "nonexistent.md" }],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a file output missing its dest discriminator", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [{ type: "file", from: "out.md", to: "x" }],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a qualify review phase with a loop.driftTo to an existing phase (Phase 45)", () => {
    const result = PipelineSchema.safeParse({
      id: "delivery",
      phases: [
        phase("architekt"),
        phase("koder"),
        phase("review", {
          qualify: true,
          loop: {
            to: "koder",
            driftTo: "architekt",
            maxRetries: 3,
            escalate: true,
            then: "park",
          },
        }),
      ],
      instructions: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects qualify on a verify phase (qualify is for agent phases only)", () => {
    const result = PipelineSchema.safeParse({
      id: "delivery",
      phases: [
        phase("koder"),
        {
          id: "verify",
          type: "verify",
          qualify: true,
          loop: { to: "koder", maxRetries: 1, escalate: false, then: "fail" },
        },
      ],
      instructions: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((i) => i.message === "qualify is for agent phases only"),
      ).toBe(true);
  });

  it("rejects a qualify phase with no loop", () => {
    const result = PipelineSchema.safeParse({
      id: "delivery",
      phases: [phase("koder"), phase("review", { qualify: true })],
      instructions: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((i) => i.message === "a qualify phase requires a loop")).toBe(
        true,
      );
  });

  it("accepts a valid ownerSubsystem tag (Phase 81)", () => {
    const result = PipelineSchema.safeParse({
      id: "delivery",
      phases: [phase("a")],
      instructions: "x",
      ownerSubsystem: "forge",
    });
    expect(result.success && result.data.ownerSubsystem).toBe("forge");
  });

  it("rejects an unknown ownerSubsystem value", () => {
    const result = PipelineSchema.safeParse({
      id: "delivery",
      phases: [phase("a")],
      instructions: "x",
      ownerSubsystem: "not-a-subsystem",
    });
    expect(result.success).toBe(false);
  });

  it("omitting ownerSubsystem stays valid (backward compat — existing fixtures unedited)", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a"), phase("b")],
      instructions: "ship it",
    });
    expect(result.success && result.data.ownerSubsystem).toBeUndefined();
  });

  it("rejects a loop.driftTo that names no existing phase", () => {
    const result = PipelineSchema.safeParse({
      id: "delivery",
      phases: [
        phase("koder"),
        phase("review", {
          qualify: true,
          loop: { to: "koder", driftTo: "ghost", maxRetries: 1, escalate: false, then: "fail" },
        }),
      ],
      instructions: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((i) => i.message.includes('loop.driftTo "ghost"'))).toBe(
        true,
      );
  });
});

describe("pipeline run schema", () => {
  it("aggregates stage runs with a pipeline state", () => {
    const parsed = PipelineRunSchema.safeParse({
      pipelineRunId: "release_1",
      pipelineId: "release",
      status: "running",
      currentStage: "build",
      stageRuns: [
        { phaseId: "build", runId: "release_1.build_1_2", attempt: 1, status: "running" },
      ],
      startedAt: new Date().toISOString(),
      cwd: "/tmp/release_1",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a stage run carrying a qualify verdict, and a legacy run without one (Phase 45)", () => {
    const base = {
      pipelineRunId: "release_1",
      pipelineId: "release",
      status: "running" as const,
      currentStage: "review",
      startedAt: new Date().toISOString(),
      cwd: "/tmp/release_1",
    };
    const withVerdict = PipelineRunSchema.safeParse({
      ...base,
      stageRuns: [
        {
          phaseId: "review",
          runId: "release_1.review_1",
          attempt: 1,
          status: "done",
          verdict: "gap",
        },
      ],
    });
    expect(withVerdict.success).toBe(true);
    const legacy = PipelineRunSchema.safeParse({
      ...base,
      stageRuns: [{ phaseId: "review", runId: "release_1.review_1", attempt: 1, status: "done" }],
    });
    expect(legacy.success).toBe(true);
  });
});

describe("T11 finding #36 — PipelinePhaseSchema.commands array cap (50, no per-string max)", () => {
  it("50 commands passes, 51 rejects", () => {
    expect(
      PipelineSchema.safeParse({
        id: "release",
        phases: [phase("v", { type: "verify", agent: undefined, commands: Array(50).fill("x") })],
        instructions: "x",
      }).success,
    ).toBe(true);
    expect(
      PipelineSchema.safeParse({
        id: "release",
        phases: [phase("v", { type: "verify", agent: undefined, commands: Array(51).fill("x") })],
        instructions: "x",
      }).success,
    ).toBe(false);
  });
});

describe("T11 finding #3 — PipelineIdSchema (naming alias, not branded)", () => {
  it("is the same schema as AgentIdSchema — an alias, not a distinct branded type", () => {
    expect(PipelineIdSchema).toBe(AgentIdSchema);
  });
});

describe("T11 finding #29 — PipelineRunArtifactSchema is the shared RunArtifactSchema", () => {
  it("is the shared common.schema export (identity), proving the dedup happened", () => {
    expect(PipelineRunArtifactSchema).toBe(RunArtifactSchema);
  });
});

describe("T11 finding #28 — StageRunStatusSchema derives from RunStatusSchema.options", () => {
  it("accepts exactly the shared RunStatus values, nothing more", () => {
    expect(StageRunStatusSchema.options).toEqual(RunStatusSchema.options);
  });

  it("rejects a task-run-only status (scheduled/parked/held/queued/pending) that isn't a run status", () => {
    expect(StageRunStatusSchema.safeParse("queued").success).toBe(false);
  });
});

/**
 * NS2 F9 — the ladder. Two exports describe it: the enum (what parses) and
 * `PIPELINE_COMPLEXITY_ORDER` (the canonical cheapest-first sort key that
 * `TaskClassifierService.pipelineCandidates` sorts by). Nothing structurally ties
 * them together, so a rung added to one and not the other would sort by
 * `indexOf(...) === -1` — silently ordering the new rung FIRST, i.e. cheapest.
 * These assertions are that tie.
 */
describe("NS2 F9 — the pipeline complexity ladder", () => {
  it("PIPELINE_COMPLEXITY_ORDER lists exactly the enum's rungs, cheapest first", () => {
    expect(PipelineComplexitySchema.options).toEqual(["light", "standard", "deep"]);
    // Same members…
    expect([...PIPELINE_COMPLEXITY_ORDER].sort()).toEqual(
      [...PipelineComplexitySchema.options].sort(),
    );
    // …and every rung is actually indexable (no -1 from a drifted name).
    for (const rung of PipelineComplexitySchema.options) {
      expect(PIPELINE_COMPLEXITY_ORDER.indexOf(rung)).toBeGreaterThanOrEqual(0);
    }
    // The ORDER is the ladder: cheapest → deepest, not alphabetical.
    expect(PIPELINE_COMPLEXITY_ORDER).toEqual(["light", "standard", "deep"]);
  });

  it("defaults a pipeline with no stated rung to the middle one, so pre-F9 files parse", () => {
    const parsed = PipelineSchema.parse({
      id: "release",
      phases: [phase("a")],
      instructions: "ship it",
    });
    expect(parsed.complexity).toBe("standard");
  });

  it("carries a stated rung through unchanged, and rejects one off the ladder", () => {
    for (const complexity of PipelineComplexitySchema.options) {
      const parsed = PipelineSchema.parse({
        id: "release",
        phases: [phase("a")],
        instructions: "ship it",
        complexity,
      });
      expect(parsed.complexity).toBe(complexity);
    }
    expect(
      PipelineSchema.safeParse({
        id: "release",
        phases: [phase("a")],
        instructions: "ship it",
        complexity: "gigantic",
      }).success,
    ).toBe(false);
  });
});
