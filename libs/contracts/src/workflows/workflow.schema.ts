import { z } from "zod";
import { AgentIdSchema, AgentModelSchema, AgentThinkingSchema } from "../agents/agent.schema";
import { AvatarSchema } from "../common.schema";
import { DepartmentIdSchema } from "../departments/department.schema";

/**
 * A workflow's `id` — same restrictive filename-safe shape as `AgentIdSchema`
 * (mirrors `ProjectIdSchema`/`SkillIdSchema`, both `= AgentIdSchema` aliases).
 * A naming alias only — NOT a branded type (see `docs/plans/entity-id-refactor.md`
 * for the owning effort on that). Used to label fields that hold a workflow id
 * (rather than an agent id) without changing the accepted shape.
 */
export const WorkflowIdSchema = AgentIdSchema;

/**
 * One rung of the loop's escalation ladder: the model/thinking override applied
 * to a retry attempt (rung n applies to retry n, 1-based; later retries clamp
 * to the last rung). Both fields optional — escalate only what changes.
 */
export const PhaseEscalationSchema = z.object({
  model: AgentModelSchema.optional(),
  thinking: AgentThinkingSchema.optional(),
});
export type PhaseEscalation = z.infer<typeof PhaseEscalationSchema>;

/**
 * A phase's optional back-edge (the "tester loop"). On failure the runner jumps
 * back to phase `to` with the failure context as its handoff input, up to
 * `maxRetries` times — the hard fuse against an infinite loop. After exhaustion it
 * `escalate`s (surfaces, never continues silently) and falls through to `then`
 * (another phase id, the literal `"fail"`, or `"park"` — durable parking for a
 * human note instead of failing).
 */
export const PhaseLoopSchema = z.object({
  to: z.string().min(1),
  maxRetries: z.number().int().min(0),
  escalate: z.boolean(),
  then: z.string().min(1),
  /** Per-retry model/thinking ladder (rung n → retry n; clamps to the last rung). */
  escalation: z.array(PhaseEscalationSchema).optional(),
  /** A qualify phase's `drift` verdict routes here instead of `to` (default: `to`). */
  driftTo: z.string().min(1).optional(),
});
export type PhaseLoop = z.infer<typeof PhaseLoopSchema>;

/**
 * What a phase executes. `agent` (the default, so every committed `.workflow.md`
 * parses unchanged) spawns the phase agent; `verify` runs deterministic shell
 * checks in the project checkout (no model, no tokens, no intents) — the "tester"
 * of the delivery loop; `tool` runs deterministic shell `commands` IN THE STAGE
 * SANDBOX (consumes → commands → produces) — a transform step between agents;
 * `workflow` runs another workflow as a child run (sub-run): `consumes` is its input,
 * its latest produced file comes back as `produces`.
 */
export const WorkflowPhaseTypeSchema = z.enum(["agent", "verify", "tool", "workflow"]);
export type WorkflowPhaseType = z.infer<typeof WorkflowPhaseTypeSchema>;

/**
 * Default verify-phase checks, shared by the API runner (fallback when neither
 * the phase nor the project declares its own) and the web display.
 */
export const DEFAULT_VERIFY_CHECKS = ["pnpm lint", "npx tsc --noEmit", "pnpm test"] as const;

/**
 * One stage of a workflow. Taken 1:1 from the dashboard's `WorkflowPhase`, plus an
 * explicit `id`: loop targets reference phases by id (not array position or agent
 * name, since two phases may run the same agent). `consumes`/`produces` are
 * RELATIVE paths inside the stage's sandbox — the handoff files.
 *
 * Field requirements depend on `type` (enforced by the workflow-level
 * superRefine): an `agent` phase requires `agent`/`model`/`thinking` and
 * `consumes`/`produces`; a `verify` phase forbids `agent` and may carry
 * `commands` (per-phase override of the project's checks).
 */
export const WorkflowPhaseSchema = z.object({
  id: z.string().min(1),
  type: WorkflowPhaseTypeSchema.default("agent"),
  agent: AgentIdSchema.optional(),
  /** `workflow` phase only: the id of the workflow run as the sub-run. */
  workflow: z.string().min(1).optional(),
  consumes: z.string().min(1).optional(),
  produces: z.string().min(1).optional(),
  model: AgentModelSchema.optional(),
  thinking: AgentThinkingSchema.optional(),
  /** Verify/tool phases: shell commands run with `&&` (verify: override project checks). */
  commands: z.array(z.string().min(1)).max(50).optional(),
  /** Verify phase only: `clean` runs the checks in a fresh checkout of the run branch's HEAD. */
  checkout: z.enum(["clean"]).optional(),
  /** Agent phase only: parse a <verdict> from `produces`; non-`pass` takes the back-edge. */
  qualify: z.boolean().optional(),
  loop: PhaseLoopSchema.optional(),
  /**
   * P1-02 — an optional human checkpoint: once this phase lands green (its
   * `produces` written), the run parks (`parkedReason: "gate"`) on a
   * `workflow-gate` approval and continues only when the operator approves; a
   * reject fails the run. Absent (the default) = fully autonomous.
   */
  approval: z.enum(["ask"]).optional(),
});
export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;

/**
 * What a workflow does with its finished work — a terminal *delivery sink*,
 * configured at the workflow level rather than baked into an agent. Sinks are
 * deterministic and system-owned (no agent, no model, no tokens), the output-side
 * counterpart of the `verify` phase. A workflow may declare several (e.g. open a PR
 * *and* drop a report file). Each names a `from` artifact — the relative path a
 * phase `produces` — as its source.
 *
 * - `pr`: derive `# title` + body from `from` (a Markdown artifact) and open a PR
 *   via the gated `git push && gh pr create`. ALWAYS parks for approval — the PR is
 *   the gate, enforced structurally by the system (Law 3), not by an agent's config.
 * - `file`: copy `from` to `to` — into the project worktree (`dest: project`, rides
 *   the run's `zibby/*` branch) or as a vault note (`dest: vault`, a durable
 *   second-brain artifact for workflows whose result is information, not code).
 * - `folder`: copy a whole folder of the run (`from` is relative to the run dir,
 *   e.g. `book` — a run-wide artifact, not a phase handoff) into the local
 *   directory `to` (absolute or `~/…`), as `<to>/<workflowRunId>/`. For products
 *   whose result is a set of files (a book: PDFs + images), not code or a note.
 */
export const WorkflowPrOutputSchema = z.object({
  type: z.literal("pr"),
  from: z.string().min(1),
});
export type WorkflowPrOutput = z.infer<typeof WorkflowPrOutputSchema>;

export const WorkflowFileOutputSchema = z.object({
  type: z.literal("file"),
  from: z.string().min(1),
  /** Where `to` resolves: a project-relative path, or a vault note id. */
  dest: z.enum(["project", "vault"]),
  to: z.string().min(1),
});
export type WorkflowFileOutput = z.infer<typeof WorkflowFileOutputSchema>;

/** A run-relative folder name: no absolute path, no `..` segment. */
const RunRelativeDirSchema = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("/") && !v.split(/[\\/]/).includes(".."), {
    message: "from must be a folder inside the run dir (relative, no ..)",
  });

export const WorkflowFolderOutputSchema = z.object({
  type: z.literal("folder"),
  /** Folder relative to the run dir, e.g. `book`. */
  from: RunRelativeDirSchema,
  /** Local target directory, absolute or `~/…`; each run lands in `<to>/<workflowRunId>/`. */
  to: z
    .string()
    .min(1)
    .refine((v) => v.startsWith("/") || v.startsWith("~/"), {
      message: "to must be an absolute path or start with ~/",
    }),
});
export type WorkflowFolderOutput = z.infer<typeof WorkflowFolderOutputSchema>;

export const WorkflowOutputSchema = z.discriminatedUnion("type", [
  WorkflowPrOutputSchema,
  WorkflowFileOutputSchema,
  WorkflowFolderOutputSchema,
]);
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;

/**
 * NS2 F9 — a workflow's rung on its owning department's complexity ladder. The
 * order of this enum IS the ladder, cheapest first: `light` (2–3 phases, cheap
 * models — narrow work that still wants a second pair of eyes), `standard` (3–4
 * phases — ordinary work with review and verification), `deep` (4–6 phases with
 * loops and escalation — multi-surface work, or work that genuinely needs
 * design + review + tests + docs).
 *
 * The rung below `light` is not a workflow at all: a single owned agent, for
 * single-surface work like a rename or a copy fix.
 */
export const WorkflowComplexitySchema = z.enum(["light", "standard", "deep"]);
export type WorkflowComplexity = z.infer<typeof WorkflowComplexitySchema>;

/**
 * The ladder as an ordered tuple — the canonical cheapest-first sort key, so no
 * consumer re-derives an ordering from the enum's declaration order by hand.
 */
export const WORKFLOW_COMPLEXITY_ORDER: readonly WorkflowComplexity[] = [
  "light",
  "standard",
  "deep",
];

/**
 * P1-03 — a per-run spend cap. Every stage's model cost plus the external cost a
 * tool reports in `<stageDir>/costs.jsonl` accrues on the run; past `maxCostUsd`
 * the run parks (`parkedReason: "budget"`) at the next phase boundary on a
 * `workflow-gate` approval (approve raises the cap by another `maxCostUsd`).
 */
export const WorkflowBudgetSchema = z
  .object({
    maxCostUsd: z.number().positive(),
    warnAtPct: z.number().int().min(1).max(100).default(70),
  })
  .strict();
export type WorkflowBudget = z.infer<typeof WorkflowBudgetSchema>;

/** The plain object form — `update` derives from this (a refined schema can't `.omit`). */
const WorkflowObject = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
  /** Optional avatar image (data URI or `/avatars/*.png` path) shown in place of the glyph. */
  avatar: AvatarSchema.optional(),
  desc: z.string().optional(),
  phases: z.array(WorkflowPhaseSchema).min(1),
  /** Terminal delivery sinks (default none, so every committed workflow parses). */
  outputs: z.array(WorkflowOutputSchema).default([]),
  instructions: z.string().min(1),
  /**
   * Attribution to a department of the federation (Phase 81) — which department
   * "owns" this workflow for the Roster (phase 85) and, since NS2 F9, whether it
   * is reachable at all: the switchboard routes only to departments, and a
   * department offers only its own owned units, so an unowned workflow is
   * structurally unroutable.
   *
   * Still `.optional()` here ON PURPOSE, even though F9's invariant is "no free
   * units". The entity store's listing is tolerant (a file that fails schema
   * validation is skipped, never fatal — `entity-file-store.ts`), so making this
   * required would turn a hand-edited file that lost its owner into a SILENT
   * disappearance instead of a reportable one. Keeping it optional is what lets
   * `GET /api/departments/unowned` stay a working diagnostic. Enforcement lives on
   * the write path instead — `workflows.controller.ts` 422s without it, mirroring
   * `agents.controller.ts`.
   */
  department: DepartmentIdSchema.optional(),
  /**
   * NS2 F9 — the workflow's rung on its department's complexity ladder, ordered
   * cheapest/shortest → most expensive/deepest. Stage-2 scoped routing
   * (`TaskClassifierService.classifyWithinDepartment`) grades a task onto a rung:
   * a single owned agent below `light`, then `light` → `standard` → `deep`.
   *
   * Data rather than file order because `DEPARTMENT_FALLBACK`'s `"primary"` policy
   * resolves a low-confidence verdict by reading `candidates[0]`, and file order
   * would silently change that the first time a directory listing reorders.
   * Defaulted so every workflow written before F9 still parses.
   */
  complexity: WorkflowComplexitySchema.default("standard"),
  /** P1-03 — optional per-run spend cap (absent = uncapped, as before). */
  budget: WorkflowBudgetSchema.optional(),
  /**
   * Default project a run of this workflow binds to when the caller names none
   * (an automation, a manual start). The project supplies the stage env + secrets
   * (e.g. which image provider a tool phase uses) and its checkout as the agent
   * cwd. An explicit project on the start request still wins.
   */
  project: AgentIdSchema.optional(),
});

/** Shared phase/loop validation (used by the full schema; storage re-validates updates). */
function refineWorkflow(p: z.infer<typeof WorkflowObject>, ctx: z.RefinementCtx): void {
  const ids = p.phases.map((ph) => ph.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "phase ids must be unique",
      path: ["phases"],
    });
  }
  p.phases.forEach((ph, i) => {
    if (ph.checkout !== undefined && ph.type !== "verify")
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "checkout is for verify phases only",
        path: ["phases", i, "checkout"],
      });
    if (ph.type === "agent") {
      for (const key of ["agent", "model", "thinking", "consumes", "produces"] as const) {
        if (ph[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `an agent phase requires "${key}"`,
            path: ["phases", i, key],
          });
        }
      }
    } else if (ph.type === "tool") {
      // tool: a deterministic sandbox transform — it must say what it runs and
      // what it leaves behind, and nothing model-shaped applies.
      if (!ph.commands?.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'a tool phase requires "commands"',
          path: ["phases", i, "commands"],
        });
      if (ph.produces === undefined)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'a tool phase requires "produces"',
          path: ["phases", i, "produces"],
        });
      for (const key of ["agent", "model", "thinking"] as const) {
        if (ph[key] !== undefined)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `a tool phase must not set "${key}"`,
            path: ["phases", i, key],
          });
      }
    } else if (ph.type === "workflow") {
      // workflow: a sub-run — it names the child, hands it a file and takes one back.
      for (const key of ["workflow", "consumes", "produces"] as const) {
        if (ph[key] === undefined)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `a workflow phase requires "${key}"`,
            path: ["phases", i, key],
          });
      }
      for (const key of ["agent", "model", "thinking", "commands"] as const) {
        if (ph[key] !== undefined)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `a workflow phase must not set "${key}"`,
            path: ["phases", i, key],
          });
      }
      if (ph.workflow !== undefined && ph.workflow === p.id)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a workflow phase cannot run its own workflow",
          path: ["phases", i, "workflow"],
        });
    } else {
      // verify: deterministic checks — an agent makes no sense here.
      if (ph.agent !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a verify phase must not name an agent",
          path: ["phases", i, "agent"],
        });
      }
    }
    // A qualify gate is meaningless without a back-edge to take, makes no sense on a
    // deterministic verify phase, and its drift target must resolve like to/then.
    if (ph.qualify) {
      if (ph.type !== "agent")
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "qualify is for agent phases only",
          path: ["phases", i, "qualify"],
        });
      if (!ph.loop)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a qualify phase requires a loop",
          path: ["phases", i, "qualify"],
        });
    }
    if (ph.loop?.driftTo && !idSet.has(ph.loop.driftTo))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `loop.driftTo "${ph.loop.driftTo}" is not an existing phase id`,
        path: ["phases", i, "loop", "driftTo"],
      });
    if (!ph.loop) return;
    for (const [key, target] of [
      ["to", ph.loop.to],
      ["then", ph.loop.then],
    ] as const) {
      const literals = key === "then" ? ["fail", "park"] : ["fail"];
      if (!literals.includes(target) && !idSet.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `loop.${key} "${target}" is not an existing phase id`,
          path: ["phases", i, "loop", key],
        });
      }
    }
  });
  // An output sink draws from a phase artifact — its `from` must be something a
  // phase actually `produces`, or it would read an empty handoff at delivery time.
  // A `folder` sink reads a run-wide folder (e.g. `book/`), not a handoff file.
  const produced = new Set(p.phases.map((ph) => ph.produces).filter(Boolean));
  p.outputs.forEach((out, i) => {
    if (out.type !== "folder" && !produced.has(out.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `output.from "${out.from}" is not produced by any phase`,
        path: ["outputs", i, "from"],
      });
    }
  });
}

/**
 * A workflow definition: an ordered chain of phases stored as a `.workflow.md`
 * file (frontmatter carries `phases`, the Markdown body is `instructions`). The
 * `superRefine` rejects a dangling back-edge at the contract boundary — every
 * `loop.to`/`loop.then` must name an existing phase id (or `"fail"`), phase ids
 * must be unique, and per-`type` field requirements hold.
 */
export const WorkflowSchema = WorkflowObject.superRefine(refineWorkflow);
export type Workflow = z.infer<typeof WorkflowSchema>;

/** Body accepted by `createWorkflow` — full entity, with loop targets validated. */
export const CreateWorkflowSchema = WorkflowSchema;
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;

/**
 * Body accepted by `updateWorkflow` — every field optional (partial), id
 * excluded. `avatar: null` is the explicit "clear" signal (see the mirrored
 * comment on `UpdateAgentSchema` — `undefined` can't survive JSON transport).
 */
export const UpdateWorkflowSchema = WorkflowObject.omit({ id: true })
  .partial()
  .extend({ avatar: AvatarSchema.nullable().optional() });
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;
