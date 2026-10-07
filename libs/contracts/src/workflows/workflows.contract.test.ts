import { describe, expect, it } from "vitest";
import { AgentIdSchema } from "../agents/agent.schema";
import { RunArtifactSchema, RunStatusSchema } from "../common.schema";
import { StageRunStatusSchema } from "./workflow-run.schema";
import { WorkflowIdSchema } from "./workflow.schema";
import { WorkflowRunArtifactSchema } from "./workflows.contract";
import {
  WORKFLOW_COMPLEXITY_ORDER,
  WorkflowComplexitySchema,
  WorkflowRunSchema,
  WorkflowSchema,
  workflowRunsContract,
  workflowsContract,
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

describe("workflowsContract", () => {
  it("exposes CRUD and keeps only the catalog-liveness run list", () => {
    expect(workflowsContract.createWorkflow.path).toBe("/api/workflows");
    expect(workflowsContract.getWorkflow.path).toBe("/api/workflows/:id");
    expect(workflowRunsContract.listWorkflowRuns.path).toBe("/api/workflows/runs");
    // The per-kind run lifecycle routes moved to the unified `taskRuns` contract.
    expect(workflowRunsContract).not.toHaveProperty("startWorkflowRun");
    expect(workflowRunsContract).not.toHaveProperty("listAllWorkflowRuns");
    expect(workflowRunsContract).not.toHaveProperty("getWorkflowRun");
    expect(workflowRunsContract).not.toHaveProperty("resumeWorkflowRun");
    expect(workflowRunsContract).not.toHaveProperty("getStageRunLogs");
    expect(workflowRunsContract).not.toHaveProperty("getWorkflowRunArtifact");
    expect(workflowRunsContract).not.toHaveProperty("deleteWorkflowRun");
  });
});

describe("workflow schema", () => {
  it("accepts a valid linear workflow", () => {
    const result = WorkflowSchema.safeParse({
      id: "release",
      phases: [phase("a"), phase("b")],
      instructions: "ship it",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a tester loop whose targets exist", () => {
    const result = WorkflowSchema.safeParse({
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
    const result = WorkflowSchema.safeParse({
      id: "release",
      phases: [
        phase("build", { loop: { to: "nope", maxRetries: 1, escalate: false, then: "fail" } }),
      ],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate phase ids", () => {
    const result = WorkflowSchema.safeParse({
      id: "release",
      phases: [phase("dup"), phase("dup")],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one phase", () => {
    expect(WorkflowSchema.safeParse({ id: "x", phases: [], instructions: "y" }).success).toBe(
      false,
    );
  });

  it("defaults outputs to an empty array (older workflows parse unchanged)", () => {
    const result = WorkflowSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      instructions: "x",
    });
    expect(result.success && result.data.outputs).toEqual([]);
  });

  it("accepts pr + file output sinks drawing from a produced artifact", () => {
    const result = WorkflowSchema.safeParse({
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

  it("accepts a folder sink without any phase producing it; rejects bad from/to", () => {
    const parse = (out: Record<string, string>) =>
      WorkflowSchema.safeParse({
        id: "release",
        phases: [phase("a")],
        outputs: [{ type: "folder", ...out }],
        instructions: "x",
      }).success;
    expect(parse({ from: "book", to: "~/books" })).toBe(true);
    expect(parse({ from: "../x", to: "~/books" })).toBe(false);
    expect(parse({ from: "book", to: "relative/dir" })).toBe(false);
  });

  it("rejects an output.from that no phase produces (superRefine)", () => {
    const result = WorkflowSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [{ type: "pr", from: "nonexistent.md" }],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a file output missing its dest discriminator", () => {
    const result = WorkflowSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [{ type: "file", from: "out.md", to: "x" }],
      instructions: "x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a qualify review phase with a loop.driftTo to an existing phase (Phase 45)", () => {
    const result = WorkflowSchema.safeParse({
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
    const result = WorkflowSchema.safeParse({
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
    const result = WorkflowSchema.safeParse({
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

  it("accepts a valid department tag (Phase 81)", () => {
    const result = WorkflowSchema.safeParse({
      id: "delivery",
      phases: [phase("a")],
      instructions: "x",
      department: "dev",
    });
    expect(result.success && result.data.department).toBe("dev");
  });

  it("rejects an unknown department value", () => {
    const result = WorkflowSchema.safeParse({
      id: "delivery",
      phases: [phase("a")],
      instructions: "x",
      department: "Not A Department",
    });
    expect(result.success).toBe(false);
  });

  it("omitting department stays valid (backward compat — existing fixtures unedited)", () => {
    const result = WorkflowSchema.safeParse({
      id: "release",
      phases: [phase("a"), phase("b")],
      instructions: "ship it",
    });
    expect(result.success && result.data.department).toBeUndefined();
  });

  it("rejects a loop.driftTo that names no existing phase", () => {
    const result = WorkflowSchema.safeParse({
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

describe("workflow phase type `workflow` (sub-run)", () => {
  const sub = (extra: Record<string, unknown> = {}) => ({
    id: "sub",
    type: "workflow",
    workflow: "child",
    consumes: "in.md",
    produces: "out.md",
    ...extra,
  });
  const parse = (ph: Record<string, unknown>, id = "parent") =>
    WorkflowSchema.safeParse({ id, phases: [ph], instructions: "x" });

  it("accepts a valid workflow phase", () => {
    expect(parse(sub()).success).toBe(true);
  });

  it.each(["workflow", "consumes", "produces"])("rejects a workflow phase missing %s", (key) => {
    const ph: Record<string, unknown> = sub();
    delete ph[key];
    expect(parse(ph).success).toBe(false);
  });

  it("rejects an agent on a workflow phase", () => {
    expect(parse(sub({ agent: "writer" })).success).toBe(false);
  });

  it("rejects a workflow phase that runs its own workflow", () => {
    expect(parse(sub({ workflow: "parent" })).success).toBe(false);
  });
});

describe("workflow run schema", () => {
  it("aggregates stage runs with a workflow state", () => {
    const parsed = WorkflowRunSchema.safeParse({
      workflowRunId: "release_1",
      workflowId: "release",
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
      workflowRunId: "release_1",
      workflowId: "release",
      status: "running" as const,
      currentStage: "review",
      startedAt: new Date().toISOString(),
      cwd: "/tmp/release_1",
    };
    const withVerdict = WorkflowRunSchema.safeParse({
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
    const legacy = WorkflowRunSchema.safeParse({
      ...base,
      stageRuns: [{ phaseId: "review", runId: "release_1.review_1", attempt: 1, status: "done" }],
    });
    expect(legacy.success).toBe(true);
  });
});

describe("T11 finding #36 — WorkflowPhaseSchema.commands array cap (50, no per-string max)", () => {
  it("50 commands passes, 51 rejects", () => {
    expect(
      WorkflowSchema.safeParse({
        id: "release",
        phases: [phase("v", { type: "verify", agent: undefined, commands: Array(50).fill("x") })],
        instructions: "x",
      }).success,
    ).toBe(true);
    expect(
      WorkflowSchema.safeParse({
        id: "release",
        phases: [phase("v", { type: "verify", agent: undefined, commands: Array(51).fill("x") })],
        instructions: "x",
      }).success,
    ).toBe(false);
  });
});

describe("T11 finding #3 — WorkflowIdSchema (naming alias, not branded)", () => {
  it("is the same schema as AgentIdSchema — an alias, not a distinct branded type", () => {
    expect(WorkflowIdSchema).toBe(AgentIdSchema);
  });
});

describe("T11 finding #29 — WorkflowRunArtifactSchema is the shared RunArtifactSchema", () => {
  it("is the shared common.schema export (identity), proving the dedup happened", () => {
    expect(WorkflowRunArtifactSchema).toBe(RunArtifactSchema);
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
 * `WORKFLOW_COMPLEXITY_ORDER` (the canonical cheapest-first sort key that
 * `TaskClassifierService.workflowCandidates` sorts by). Nothing structurally ties
 * them together, so a rung added to one and not the other would sort by
 * `indexOf(...) === -1` — silently ordering the new rung FIRST, i.e. cheapest.
 * These assertions are that tie.
 */
describe("NS2 F9 — the workflow complexity ladder", () => {
  it("WORKFLOW_COMPLEXITY_ORDER lists exactly the enum's rungs, cheapest first", () => {
    expect(WorkflowComplexitySchema.options).toEqual(["light", "standard", "deep"]);
    // Same members…
    expect([...WORKFLOW_COMPLEXITY_ORDER].sort()).toEqual(
      [...WorkflowComplexitySchema.options].sort(),
    );
    // …and every rung is actually indexable (no -1 from a drifted name).
    for (const rung of WorkflowComplexitySchema.options) {
      expect(WORKFLOW_COMPLEXITY_ORDER.indexOf(rung)).toBeGreaterThanOrEqual(0);
    }
    // The ORDER is the ladder: cheapest → deepest, not alphabetical.
    expect(WORKFLOW_COMPLEXITY_ORDER).toEqual(["light", "standard", "deep"]);
  });

  it("defaults a workflow with no stated rung to the middle one, so pre-F9 files parse", () => {
    const parsed = WorkflowSchema.parse({
      id: "release",
      phases: [phase("a")],
      instructions: "ship it",
    });
    expect(parsed.complexity).toBe("standard");
  });

  it("carries a stated rung through unchanged, and rejects one off the ladder", () => {
    for (const complexity of WorkflowComplexitySchema.options) {
      const parsed = WorkflowSchema.parse({
        id: "release",
        phases: [phase("a")],
        instructions: "ship it",
        complexity,
      });
      expect(parsed.complexity).toBe(complexity);
    }
    expect(
      WorkflowSchema.safeParse({
        id: "release",
        phases: [phase("a")],
        instructions: "ship it",
        complexity: "gigantic",
      }).success,
    ).toBe(false);
  });
});

describe("verify evidence contract", () => {
  const wf = (verify: Record<string, unknown>) =>
    WorkflowSchema.safeParse({
      id: "delivery",
      phases: [phase("koder"), { id: "verify", type: "verify", ...verify }],
      instructions: "x",
    });

  it("accepts checkout: clean on a verify phase", () => {
    expect(wf({ checkout: "clean" }).success).toBe(true);
  });

  it("rejects checkout on an agent phase", () => {
    const result = WorkflowSchema.safeParse({
      id: "delivery",
      phases: [phase("koder", { checkout: "clean" })],
      instructions: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((i) => i.message === "checkout is for verify phases only"),
      ).toBe(true);
  });

  it("round-trips verifyEvidence and prBlockedReason on a WorkflowRun", () => {
    const verifyEvidence = {
      phaseId: "verify",
      stageRunId: "release_1.verify_1",
      commands: ["pnpm test"],
      exitCode: 0,
      sha: "abc123",
      cleanCheckout: true,
      at: new Date().toISOString(),
    };
    const parsed = WorkflowRunSchema.safeParse({
      workflowRunId: "release_1",
      workflowId: "release",
      status: "running",
      currentStage: "verify",
      stageRuns: [],
      startedAt: new Date().toISOString(),
      cwd: "/tmp/release_1",
      verifyEvidence,
      prBlockedReason: "no verify evidence",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.verifyEvidence).toEqual(verifyEvidence);
      expect(parsed.data.prBlockedReason).toBe("no verify evidence");
    }
  });
});
