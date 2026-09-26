import type { DepartmentId, Pipeline } from "@zibby/contracts";

/**
 * NS2 F1b — the pure ownership-seed mapping used by {@link OwnerBackfillService}
 * (`owner-backfill.service.ts`). No I/O here on purpose: every function takes
 * already-loaded entities (or an id) and returns an owner or `undefined`, so
 * the mapping is exercised directly in `owner-seed.test.ts` without a temp dir.
 *
 * Roadmap premise corrections baked in (see `docs/plans/ns2-f1-ownership-is-data.md`):
 * - Integrations are NOT seeded here: an integration's department membership is
 *   DERIVED, not stored (ops listens to every integration, comms replies
 *   through the reply-enabled ones — see `DepartmentsService.roster`). Monitors
 *   (ci-stream GitHub integrations) fall out of that same derivation for free.
 * - knowledge/finance own no dispatchable entities yet (memory + budget are
 *   services, not stored entities carrying an owner tag) — neither function
 *   below ever returns them.
 */

/**
 * Explicit, commented rule table for pipeline ownership by id. Anything not
 * listed here is intentionally unmatched — `undefined`, not a guess.
 *
 * NS2 F9 corrected two entries that had drifted from the stored files:
 * - `code-audit` → `qa`, not `rnd`. F5c ("Arch v1 — scheduled quality
 *   audit") moved the stored pipeline and left this table behind; the stored
 *   file always wins at runtime, so the drift was latent, not active.
 * - the outward-facing pipelines (`content-piece`, `content-campaign`,
 *   `sales-outreach`) → `com`, not `rnd`. Research's mandate is "výzkumné
 *   pipeline, které předávají výsledný artefakt dál"; comms's is "mluví za
 *   ZIBBY navenek". Content and outreach are outward voice, not research — they
 *   sat under research only because research was one of the three seated departments
 *   before F9 crewed the rest of the federation.
 */
const PIPELINE_OWNER_BY_ID: Readonly<Record<string, DepartmentId>> = {
  delivery: "dev",
  research: "rnd",
  "product-discovery": "rnd",
  "content-campaign": "com",
  "content-piece": "com",
  "sales-outreach": "com",
  "code-audit": "qa",
};

/** Seed owner for a pipeline id, or `undefined` when the id isn't in the rule table. */
export function pipelineOwnerSeed(pipelineId: string): DepartmentId | undefined {
  return PIPELINE_OWNER_BY_ID[pipelineId];
}

/**
 * Agents referenced by a delivery-role pipeline's `agent` phase seed to that
 * pipeline's owner. Walks every pipeline whose {@link pipelineOwnerSeed} (or
 * already-stored `department`) resolves to `dev` and collects every
 * `agent` id its phases reference. Pure over already-loaded pipelines — the
 * caller (`OwnerBackfillService`) does the I/O.
 */
export function agentOwnersFromPipelines(
  pipelines: readonly Pick<Pipeline, "id" | "department" | "phases">[],
): Map<string, DepartmentId> {
  const owners = new Map<string, DepartmentId>();
  for (const pipeline of pipelines) {
    const owner = pipeline.department ?? pipelineOwnerSeed(pipeline.id);
    if (owner !== "dev") continue;
    for (const phase of pipeline.phases) {
      if (phase.type === "agent" && phase.agent) owners.set(phase.agent, owner);
    }
  }
  return owners;
}
