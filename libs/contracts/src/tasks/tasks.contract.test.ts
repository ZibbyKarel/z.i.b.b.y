import { describe, expect, it } from "vitest";
import {
  AttachmentSchema,
  CreateTaskInputSchema,
  ProposedGoalSchema,
  ResolvedPathSchema,
  ScheduledTaskSchema,
  ScheduledTaskStatusSchema,
  TaskOutputSchema,
  TaskRoutingSchema,
  tasksContract,
} from "../index";

describe("tasksContract", () => {
  it("exposes a POST /api/tasks/classify route returning 200 and 422", () => {
    expect(tasksContract.classifyTask.method).toBe("POST");
    expect(tasksContract.classifyTask.path).toBe("/api/tasks/classify");
    expect(tasksContract.classifyTask.responses).toHaveProperty("200");
    expect(tasksContract.classifyTask.responses).toHaveProperty("422");
  });
});

describe("TaskRoutingSchema", () => {
  const valid = {
    target: { kind: "agent", id: "curator", name: "Kurátor", glyph: "film", category: "Média" },
    confidence: 0.71,
    reason: "Matched: média, knihovna",
    matchedTerms: ["média", "knihovna"],
    candidates: [{ kind: "agent", id: "curator", name: "Kurátor" }],
  };

  it("accepts a well-formed routing verdict", () => {
    expect(TaskRoutingSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a confidence above 1", () => {
    expect(TaskRoutingSchema.safeParse({ ...valid, confidence: 1.4 }).success).toBe(false);
  });

  it("rejects a missing target", () => {
    const { confidence, reason, matchedTerms, candidates } = valid;
    expect(
      TaskRoutingSchema.safeParse({ confidence, reason, matchedTerms, candidates }).success,
    ).toBe(false);
  });

  it("rejects an empty candidate list", () => {
    expect(TaskRoutingSchema.safeParse({ ...valid, candidates: [] }).success).toBe(false);
  });

  it("accepts the orchestrator fallback target (no id, synthetic display)", () => {
    const routing = {
      ...valid,
      target: { kind: "orchestrator", name: "Orchestrator", glyph: "compass" },
    };
    expect(TaskRoutingSchema.safeParse(routing).success).toBe(true);
  });

  it("rejects an agent target without an id", () => {
    const routing = { ...valid, target: { kind: "agent", name: "Kurátor" } };
    expect(TaskRoutingSchema.safeParse(routing).success).toBe(false);
  });

  // ── Phase 11: mode / proposedGoal / paths (additive, back-compatible) ──────
  it("applies defaults to an old-shaped response (single / null / [])", () => {
    const parsed = TaskRoutingSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.mode).toBe("single");
    expect(parsed.data.proposedGoal).toBeNull();
    expect(parsed.data.paths).toEqual([]);
  });

  it("round-trips a loop verdict carrying a synthesized proposedGoal + resolved paths", () => {
    const loop = {
      ...valid,
      mode: "loop" as const,
      proposedGoal: {
        objective: "fix the failing test until it's green",
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks" },
        maxIterations: 6,
        instructions: "fix the failing test until it's green",
      },
      paths: [
        { path: "~/Projects/alpha", project: { id: "alpha", name: "Alpha" } },
        { path: "/tmp/scratch", project: null },
      ],
    };
    const parsed = TaskRoutingSchema.safeParse(loop);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.mode).toBe("loop");
    expect(parsed.data.proposedGoal?.maker).toEqual({ kind: "pipeline", id: "delivery" });
    expect(parsed.data.paths[0]?.project?.name).toBe("Alpha");
    expect(parsed.data.paths[1]?.project).toBeNull();
  });
});

describe("ProposedGoalSchema (Phase 11)", () => {
  const valid = {
    objective: "keep going until tests pass",
    maker: { kind: "agent" as const, id: "coder" },
    verifier: { kind: "checks" as const },
    maxIterations: 6,
    instructions: "keep going until tests pass",
  };

  it("validates a synthesized goal proposal", () => {
    expect(ProposedGoalSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-positive maxIterations", () => {
    expect(ProposedGoalSchema.safeParse({ ...valid, maxIterations: 0 }).success).toBe(false);
  });

  it("rejects an empty objective", () => {
    expect(ProposedGoalSchema.safeParse({ ...valid, objective: "" }).success).toBe(false);
  });
});

describe("ResolvedPathSchema (Phase 11)", () => {
  it("round-trips a path scoped to a project", () => {
    const parsed = ResolvedPathSchema.safeParse({
      path: "~/Projects/alpha/src",
      project: { id: "alpha", name: "Alpha" },
    });
    expect(parsed.success).toBe(true);
  });

  it("round-trips an unscoped (null-project) path", () => {
    const parsed = ResolvedPathSchema.safeParse({ path: "/tmp/x", project: null });
    expect(parsed.success).toBe(true);
  });
});

describe("CreateTaskInputSchema (Phase 11 explicit target)", () => {
  it("accepts an optional goal target (scheduled-loop dispatch)", () => {
    const parsed = CreateTaskInputSchema.safeParse({
      text: "loop it",
      target: { kind: "goal", id: "my-goal", name: "My Goal" },
    });
    expect(parsed.success).toBe(true);
  });

  it("Phase 91: accepts a subsystem target with a valid closed-enum id", () => {
    const parsed = CreateTaskInputSchema.safeParse({
      text: "dispatch to the subsystem",
      target: { kind: "subsystem", id: "herald", name: "Herald" },
    });
    expect(parsed.success).toBe(true);
  });

  it("Phase 91: rejects a subsystem target whose id isn't in the closed registry", () => {
    const parsed = CreateTaskInputSchema.safeParse({
      text: "dispatch to the subsystem",
      target: { kind: "subsystem", id: "not-a-real-subsystem", name: "??" },
    });
    expect(parsed.success).toBe(false);
  });

  it("stays valid with no target (the default path)", () => {
    expect(CreateTaskInputSchema.safeParse({ text: "just do it" }).success).toBe(true);
  });

  it("accepts each chosen output (pr / file / void)", () => {
    expect(CreateTaskInputSchema.safeParse({ text: "x", output: { type: "pr" } }).success).toBe(
      true,
    );
    expect(
      CreateTaskInputSchema.safeParse({
        text: "x",
        output: { type: "file", dest: "vault", to: "notes/x.md" },
      }).success,
    ).toBe(true);
    expect(CreateTaskInputSchema.safeParse({ text: "x", output: { type: "void" } }).success).toBe(
      true,
    );
  });

  it("rejects a file output missing its dest/to", () => {
    expect(CreateTaskInputSchema.safeParse({ text: "x", output: { type: "file" } }).success).toBe(
      false,
    );
  });
});

describe("TaskOutputSchema", () => {
  it("rejects an unknown output type", () => {
    expect(TaskOutputSchema.safeParse({ type: "email" }).success).toBe(false);
  });

  it("rejects a file dest outside project/vault", () => {
    expect(TaskOutputSchema.safeParse({ type: "file", dest: "s3", to: "x.md" }).success).toBe(
      false,
    );
  });
});

describe("ScheduledTask budget statuses (Phase 8)", () => {
  it("includes held + queued in the lifecycle enum", () => {
    expect(ScheduledTaskStatusSchema.options).toContain("held");
    expect(ScheduledTaskStatusSchema.options).toContain("queued");
  });

  const base = {
    id: "task_1",
    title: "",
    text: "fix the bug",
    paths: [],
    scheduledAt: 1_700_000_000_000,
    status: "queued" as const,
    createdAt: new Date().toISOString(),
  };

  it("accepts a queued task attributed to a project", () => {
    expect(ScheduledTaskSchema.safeParse({ ...base, projectId: "alpha" }).success).toBe(true);
  });

  it("accepts a held task carrying its approval + reason", () => {
    expect(
      ScheduledTaskSchema.safeParse({
        ...base,
        status: "held",
        projectId: "alpha",
        heldReason: "project-daily cap reached",
        approvalId: "task_1_ab",
      }).success,
    ).toBe(true);
  });

  it("includes awaiting-output and round-trips a task parked at the PR gate", () => {
    expect(ScheduledTaskStatusSchema.options).toContain("awaiting-output");
    const parsed = ScheduledTaskSchema.safeParse({
      ...base,
      status: "awaiting-output",
      runRef: "run_1",
      target: { kind: "agent", id: "writer", name: "Writer" },
      output: { type: "pr" },
      pendingOutput: {
        branch: "zibby/run-1-writer",
        repoPath: "/repo",
        approvalId: "task_1_ab",
        title: "Ship it",
        body: "the body",
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("AttachmentSchema (Task attachments — Phase 1)", () => {
  it("round-trips an attachment", () => {
    const parsed = AttachmentSchema.safeParse({ name: "spec.pdf", size: 1234, mediaType: "application/pdf" });
    expect(parsed.success).toBe(true);
  });

  it("defaults task attachments to [] and accepts attachmentSetId", () => {
    const task = ScheduledTaskSchema.parse({
      id: "t1", text: "do it", scheduledAt: 1, status: "scheduled",
      createdAt: "2026-07-03T00:00:00.000Z", attachmentSetId: "set_1",
    });
    expect(task.attachments).toEqual([]);
    expect(task.attachmentSetId).toBe("set_1");
  });

  it("accepts attachmentSetId on create input", () => {
    const input = CreateTaskInputSchema.parse({ text: "x", attachmentSetId: "set_1" });
    expect(input.attachmentSetId).toBe("set_1");
  });
});
