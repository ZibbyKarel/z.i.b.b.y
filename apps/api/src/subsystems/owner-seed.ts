import type { Pipeline, SubsystemId } from "@zibby/contracts";

/**
 * NS2 F1b — the pure ownership-seed mapping used by {@link OwnerBackfillService}
 * (`owner-backfill.service.ts`). No I/O here on purpose: every function takes
 * already-loaded entities (or an id) and returns an owner or `undefined`, so
 * the mapping is exercised directly in `owner-seed.test.ts` without a temp dir.
 *
 * Roadmap premise corrections baked in (see `docs/plans/ns2-f1-ownership-is-data.md`):
 * - There is no standalone monitor entity — a monitor is a ci-stream GitHub
 *   `Integration`, so integration ownership covers monitor ownership for free.
 * - The puls/herald split is NOT derivable at seed time (no stored
 *   reply-capability field yet) — every integration seeds to `puls`, herald
 *   split deferred (`TODO(F-herald)`).
 * - codex/ledger own no dispatchable entities yet (memory + budget are
 *   services, not stored entities carrying an owner tag) — neither function
 *   below ever returns them.
 */

/**
 * Explicit, commented rule table for pipeline ownership by id. `delivery` is the
 * one delivery-role pipeline → `forge`; the research-shaped pipelines (deep
 * research, product discovery, the two content pipelines, sales outreach, and
 * the code-audit pipeline) all hand a finished artifact onward → `scout`.
 * Anything not listed here (e.g. `demo-pipe`) is intentionally unmatched —
 * `undefined`, not a guess.
 */
const PIPELINE_OWNER_BY_ID: Readonly<Record<string, SubsystemId>> = {
  delivery: "forge",
  research: "scout",
  "product-discovery": "scout",
  "content-campaign": "scout",
  "content-piece": "scout",
  "sales-outreach": "scout",
  "code-audit": "scout",
};

/** Seed owner for a pipeline id, or `undefined` when the id isn't in the rule table. */
export function pipelineOwnerSeed(pipelineId: string): SubsystemId | undefined {
  return PIPELINE_OWNER_BY_ID[pipelineId];
}

/**
 * Every integration (including ci-stream GitHub monitors — there is no
 * standalone monitor entity, see module doc) seeds to `puls`.
 *
 * NS2 F8 — this DELIBERATELY includes the calendar integration. "Puls polls,
 * Hearth consumes": Puls owns every inbound heartbeat (channel polling,
 * calendar, CI/CD monitors — north-star-2.md's §The Chairs is explicit), and
 * Hearth is Tier-3-leaning ("surface, don't act"), not a watcher — giving it
 * the calendar poller would violate its own charter. Hearth instead owns the
 * personal vault domain (`domain: personal` notes, quick capture, the
 * personal agenda/reminders surface) built FROM Puls's calendar reads, not
 * the poller itself. Do not "fix" this by routing calendar to hearth — see
 * `docs/plans/ns2-f8-hearth-personal.md`'s FC-1 for the full ruling.
 *
 * TODO(F-herald): once a reply-capability criterion exists, reply-capable
 * integrations should route to `herald` instead.
 */
export function integrationOwnerSeed(): SubsystemId {
  return "puls";
}

/**
 * Agents referenced by a delivery-role pipeline's `agent` phase seed to that
 * pipeline's owner. Walks every pipeline whose {@link pipelineOwnerSeed} (or
 * already-stored `ownerSubsystem`) resolves to `forge` and collects every
 * `agent` id its phases reference. Pure over already-loaded pipelines — the
 * caller (`OwnerBackfillService`) does the I/O.
 */
export function agentOwnersFromPipelines(
  pipelines: readonly Pick<Pipeline, "id" | "ownerSubsystem" | "phases">[],
): Map<string, SubsystemId> {
  const owners = new Map<string, SubsystemId>();
  for (const pipeline of pipelines) {
    const owner = pipeline.ownerSubsystem ?? pipelineOwnerSeed(pipeline.id);
    if (owner !== "forge") continue;
    for (const phase of pipeline.phases) {
      if (phase.type === "agent" && phase.agent) owners.set(phase.agent, owner);
    }
  }
  return owners;
}
