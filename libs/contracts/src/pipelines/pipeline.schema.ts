import { z } from "zod";
import { AgentIdSchema, AgentModelSchema, AgentThinkingSchema } from "../agents/agent.schema";
import { AvatarSchema } from "../common.schema";
import { SubsystemIdSchema } from "../subsystems/subsystem.schema";

/**
 * A pipeline's `id` — same restrictive filename-safe shape as `AgentIdSchema`
 * (mirrors `ProjectIdSchema`/`SkillIdSchema`, both `= AgentIdSchema` aliases).
 * A naming alias only — NOT a branded type (see `docs/plans/entity-id-refactor.md`
 * for the owning effort on that). Used to label fields that hold a pipeline id
 * (rather than an agent id) without changing the accepted shape.
 */
export const PipelineIdSchema = AgentIdSchema;

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
 * What a phase executes. `agent` (the default, so every committed `.pipeline.md`
 * parses unchanged) spawns the phase agent; `verify` runs deterministic shell
 * checks (no model, no tokens, no intents) — the "tester" of the delivery loop.
 */
export const PipelinePhaseTypeSchema = z.enum(["agent", "verify"]);
export type PipelinePhaseType = z.infer<typeof PipelinePhaseTypeSchema>;

/**
 * Default verify-phase checks, shared by the API runner (fallback when neither
 * the phase nor the project declares its own) and the web display.
 */
export const DEFAULT_VERIFY_CHECKS = ["pnpm lint", "npx tsc --noEmit", "pnpm test"] as const;

/**
 * One stage of a pipeline. Taken 1:1 from the dashboard's `PipelinePhase`, plus an
 * explicit `id`: loop targets reference phases by id (not array position or agent
 * name, since two phases may run the same agent). `consumes`/`produces` are
 * RELATIVE paths inside the stage's sandbox — the handoff files.
 *
 * Field requirements depend on `type` (enforced by the pipeline-level
 * superRefine): an `agent` phase requires `agent`/`model`/`thinking` and
 * `consumes`/`produces`; a `verify` phase forbids `agent` and may carry
 * `commands` (per-phase override of the project's checks).
 */
export const PipelinePhaseSchema = z.object({
  id: z.string().min(1),
  type: PipelinePhaseTypeSchema.default("agent"),
  agent: AgentIdSchema.optional(),
  consumes: z.string().min(1).optional(),
  produces: z.string().min(1).optional(),
  model: AgentModelSchema.optional(),
  thinking: AgentThinkingSchema.optional(),
  /** Verify phases only: shell commands run with `&&` (override project checks). */
  commands: z.array(z.string().min(1)).max(50).optional(),
  /** Agent phase only: parse a <verdict> from `produces`; non-`pass` takes the back-edge. */
  qualify: z.boolean().optional(),
  loop: PhaseLoopSchema.optional(),
});
export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>;

/**
 * What a pipeline does with its finished work — a terminal *delivery sink*,
 * configured at the pipeline level rather than baked into an agent. Sinks are
 * deterministic and system-owned (no agent, no model, no tokens), the output-side
 * counterpart of the `verify` phase. A pipeline may declare several (e.g. open a PR
 * *and* drop a report file). Each names a `from` artifact — the relative path a
 * phase `produces` — as its source.
 *
 * - `pr`: derive `# title` + body from `from` (a Markdown artifact) and open a PR
 *   via the gated `git push && gh pr create`. ALWAYS parks for approval — the PR is
 *   the gate, enforced structurally by the system (Law 3), not by an agent's config.
 * - `file`: copy `from` to `to` — into the project worktree (`dest: project`, rides
 *   the run's `zibby/*` branch) or as a vault note (`dest: vault`, a durable
 *   second-brain artifact for pipelines whose result is information, not code).
 */
export const PipelinePrOutputSchema = z.object({
  type: z.literal("pr"),
  from: z.string().min(1),
});
export type PipelinePrOutput = z.infer<typeof PipelinePrOutputSchema>;

export const PipelineFileOutputSchema = z.object({
  type: z.literal("file"),
  from: z.string().min(1),
  /** Where `to` resolves: a project-relative path, or a vault note id. */
  dest: z.enum(["project", "vault"]),
  to: z.string().min(1),
});
export type PipelineFileOutput = z.infer<typeof PipelineFileOutputSchema>;

export const PipelineOutputSchema = z.discriminatedUnion("type", [
  PipelinePrOutputSchema,
  PipelineFileOutputSchema,
]);
export type PipelineOutput = z.infer<typeof PipelineOutputSchema>;

/**
 * NS2 F9 — a pipeline's rung on its owning subsystem's complexity ladder. The
 * order of this enum IS the ladder, cheapest first: `light` (2–3 phases, cheap
 * models — narrow work that still wants a second pair of eyes), `standard` (3–4
 * phases — ordinary work with review and verification), `deep` (4–6 phases with
 * loops and escalation — multi-surface work, or work that genuinely needs
 * design + review + tests + docs).
 *
 * The rung below `light` is not a pipeline at all: a single owned agent, for
 * single-surface work like a rename or a copy fix.
 */
export const PipelineComplexitySchema = z.enum(["light", "standard", "deep"]);
export type PipelineComplexity = z.infer<typeof PipelineComplexitySchema>;

/**
 * The ladder as an ordered tuple — the canonical cheapest-first sort key, so no
 * consumer re-derives an ordering from the enum's declaration order by hand.
 */
export const PIPELINE_COMPLEXITY_ORDER: readonly PipelineComplexity[] = [
  "light",
  "standard",
  "deep",
];

/** The plain object form — `update` derives from this (a refined schema can't `.omit`). */
const PipelineObject = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
  /** Optional avatar image (data URI or `/avatars/*.png` path) shown in place of the glyph. */
  avatar: AvatarSchema.optional(),
  desc: z.string().optional(),
  phases: z.array(PipelinePhaseSchema).min(1),
  /** Terminal delivery sinks (default none, so every committed pipeline parses). */
  outputs: z.array(PipelineOutputSchema).default([]),
  instructions: z.string().min(1),
  /**
   * Attribution to a subsystem of the federation (Phase 81) — which subsystem
   * "owns" this pipeline for the Roster (phase 85) and, since NS2 F9, whether it
   * is reachable at all: the switchboard routes only to subsystems, and a
   * subsystem offers only its own owned units, so an unowned pipeline is
   * structurally unroutable.
   *
   * Still `.optional()` here ON PURPOSE, even though F9's invariant is "no free
   * units". The entity store's listing is tolerant (a file that fails schema
   * validation is skipped, never fatal — `entity-file-store.ts`), so making this
   * required would turn a hand-edited file that lost its owner into a SILENT
   * disappearance instead of a reportable one. Keeping it optional is what lets
   * `GET /api/subsystems/unowned` stay a working diagnostic. Enforcement lives on
   * the write path instead — `pipelines.controller.ts` 422s without it, mirroring
   * `agents.controller.ts`.
   */
  ownerSubsystem: SubsystemIdSchema.optional(),
  /**
   * NS2 F9 — the pipeline's rung on its subsystem's complexity ladder, ordered
   * cheapest/shortest → most expensive/deepest. Stage-2 scoped routing
   * (`TaskClassifierService.classifyWithinSubsystem`) grades a task onto a rung:
   * a single owned agent below `light`, then `light` → `standard` → `deep`.
   *
   * Data rather than file order because `SUBSYSTEM_FALLBACK`'s `"primary"` policy
   * resolves a low-confidence verdict by reading `candidates[0]`, and file order
   * would silently change that the first time a directory listing reorders.
   * Defaulted so every pipeline written before F9 still parses.
   */
  complexity: PipelineComplexitySchema.default("standard"),
});

/** Shared phase/loop validation (used by the full schema; storage re-validates updates). */
function refinePipeline(p: z.infer<typeof PipelineObject>, ctx: z.RefinementCtx): void {
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
  const produced = new Set(p.phases.map((ph) => ph.produces).filter(Boolean));
  p.outputs.forEach((out, i) => {
    if (!produced.has(out.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `output.from "${out.from}" is not produced by any phase`,
        path: ["outputs", i, "from"],
      });
    }
  });
}

/**
 * A pipeline definition: an ordered chain of phases stored as a `.pipeline.md`
 * file (frontmatter carries `phases`, the Markdown body is `instructions`). The
 * `superRefine` rejects a dangling back-edge at the contract boundary — every
 * `loop.to`/`loop.then` must name an existing phase id (or `"fail"`), phase ids
 * must be unique, and per-`type` field requirements hold.
 */
export const PipelineSchema = PipelineObject.superRefine(refinePipeline);
export type Pipeline = z.infer<typeof PipelineSchema>;

/** Body accepted by `createPipeline` — full entity, with loop targets validated. */
export const CreatePipelineSchema = PipelineSchema;
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;

/**
 * Body accepted by `updatePipeline` — every field optional (partial), id
 * excluded. `avatar: null` is the explicit "clear" signal (see the mirrored
 * comment on `UpdateAgentSchema` — `undefined` can't survive JSON transport).
 */
export const UpdatePipelineSchema = PipelineObject.omit({ id: true })
  .partial()
  .extend({ avatar: AvatarSchema.nullable().optional() });
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;
