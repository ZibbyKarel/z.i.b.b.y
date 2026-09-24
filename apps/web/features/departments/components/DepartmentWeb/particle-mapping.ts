/**
 * Pure event→particle mapping for Phase 89 ("alive, not merely animated"). No React,
 * no DOM — same posture as `subsystem-web-geometry.ts` — so the classification is
 * unit-tested independent of rendering.
 *
 * THE CONSTRAINT: motion = real events only. A flight fires because a `RunStatusEvent`
 * actually arrived and could be attributed to an owning subsystem — never a guess,
 * never a timer. An unattributable event (owner unknown, or a status that isn't a
 * dispatch/report) produces no flight; the scene's existing ambience already stands
 * for "something happened" (design doc, phase-89 handoff).
 *
 * ATTRIBUTION resolves both `pipeline`- and `agent`-kind runs (Phase 126g):
 * `Pipeline`/`Chain`/`Agent` all carry an optional `ownerSubsystem` (Phase 81 tagged
 * the first two, NS2 F1a added it to `Agent`) — only `GoalRun` carries none (D16,
 * `docs/plans/phase-126g-subsystem-orb-agent-runs.md`), so `goal-runs` events can
 * never resolve an owner. The top-level scope gate below accepts BOTH the
 * `pipeline-runs` and `agent-runs` SSE scopes (Phase 126g review pass) — the API
 * really does emit a real `agent-runs` scope for an agent run's own dispatch/report
 * transitions (`apps/api/src/events/events.controller.ts`'s `fromRunStatus<AgentRun>`
 * call, `runId: run.runId` — the same id `RunView.runId` carries for that run), so
 * without this the comet handoff-flares (`flightForEvent`'s live caller,
 * `SubsystemOrbMap.tsx`) would stay silent for agent-kind work even though the
 * orbit-field dots and the connector-dash state both light up. `subsystemLoad.ts`'s
 * `activeRunsBySubsystem` still synthesizes `{ scope: "pipeline-runs", runId }` for
 * every run regardless of its real kind — that scope literal is no longer
 * load-bearing (either accepted scope reaches the same RUN lookup below, which was
 * already kind-agnostic), it's just the one that was there first. A CHAIN's owner
 * never appears here directly either: the API never emits a `chain-runs` SSE scope
 * (`apps/api/src/events/events.controller.ts` merges only agent-runs/pipeline-runs/
 * goal-runs/channel-items/activity — `ChainRunnerService.onRunStatus` exists but is
 * never wired into `/api/events`), so a chain's progress is only ever OBSERVABLE
 * client-side as its underlying pipeline STEP's own `pipeline-runs` transitions —
 * which is fine, because each step's pipeline carries its own independent
 * `ownerSubsystem` tag (Phase 81 tagged both `Pipeline` and `Chain`).
 *
 * The raw event payload for `pipeline-runs` mirrors `PipelineRun.status`
 * (`PipelineStateSchema`: `running | done | parked | failed | paused-limit |
 * interrupted` — see `libs/contracts/src/pipelines/pipeline-run.schema.ts`), NOT the
 * unified feed's `TaskRunStatus` — a pipeline reports failure as `failed`, never
 * `error`, and parks (its Tier-3 handup) as `parked`, never `awaiting-approval`. Get
 * this wrong and the classifier silently never fires — this file reads the raw
 * enum, not the enriched one. `agent-runs` carries `AgentRun.status` directly
 * (`RunStatusSchema`: `running | done | error | interrupted | awaiting-approval |
 * paused-limit` — `libs/contracts/src/common.schema.ts`) — an agent reports
 * failure as `error` (never `failed`) and its Tier-3 handup as
 * `awaiting-approval` (never `parked`); both are in {@link REPORT_STATUSES}.
 */
import type { Agent, SubsystemId } from "@zibby/contracts";
import type { Pipeline } from "../../../../domain";
import type { RunView } from "../../../runs/run";
import type { RunStatusEvent } from "../../../runs/runEvents";

/** A dispatch (`orb → node`) or a report (`node → orb`) — always a spoke, never a
 * rim edge (see the module doc: rim/node→node handoffs are SKIPPED entirely — no
 * `chain-runs` SSE scope exists to identify a step-to-step transition honestly). */
export interface EventFlight {
  from: SubsystemId | "orb";
  to: SubsystemId | "orb";
  subsystemId: SubsystemId;
}

/** A status that means "just started" — center → node. Shared across both
 * attributable scopes: `running` means the same thing whether the event is
 * `pipeline-runs` or `agent-runs` (Phase 126g). */
const STARTED_STATUSES = new Set(["running"]);

/**
 * A status that means "just reported" — node → center. Shared across both
 * attributable scopes, and the two status vocabularies never collide in
 * meaning even though they share one `Set`:
 * - pipeline: `failed` is its failure report; `parked` IS its Tier-3 handup
 *   (its approval-pending state — pipelines never emit `awaiting-approval`,
 *   only agent runs do).
 * - agent (Phase 126g): `error` is its failure report (`AgentRun.status`
 *   never uses `failed` — see the module doc); `awaiting-approval` IS its own
 *   Tier-3 handup, the mirror image of the pipeline's `parked`.
 *
 * `paused-limit` (an automatic, non-decision pause) and `interrupted` (an
 * operator-initiated stop, not the subsystem reporting anything) are
 * deliberately excluded for BOTH kinds.
 */
const REPORT_STATUSES = new Set(["done", "failed", "parked", "error", "awaiting-approval"]);

/** SSE scopes that can resolve to an owning subsystem — `pipeline-runs` against
 * `pipelines`, `agent-runs` against `agents` (Phase 126g). `goal-runs` (D16),
 * `channel-items` and `activity` are deliberately absent — see the module doc. */
const ATTRIBUTABLE_SCOPES = new Set(["pipeline-runs", "agent-runs"]);

/**
 * The subsystem that owns the run named by an attributable event
 * ({@link ATTRIBUTABLE_SCOPES}), or `undefined` when it can't be resolved: any
 * other scope (no `ownerSubsystem` path exists for it — most notably
 * `goal-runs`, D16), a run not yet present in the client's (SSE-invalidated,
 * asynchronously refetched) runs cache — a real race on a brand-new run's very
 * first `running` transition, accepted per the module doc rather than papered
 * over with a guess — or a pipeline/agent with no `ownerSubsystem` tag at all.
 * Resolves BOTH a `pipeline`-kind run (against `pipelines`) and an
 * `agent`-kind run (against `agents`), symmetrically. The RUN lookup below is
 * kind-agnostic on purpose (it doesn't cross-check the event's scope against
 * the matched run's kind) — that's what lets `subsystemLoad.ts`'s
 * `activeRunsBySubsystem` keep synthesizing a `pipeline-runs` scope for every
 * run regardless of its real kind and still reach the agent branch; a REAL
 * event's scope and its `runId`'s real kind always agree in practice, so this
 * never cross-attributes in production.
 */
export function resolveEventOwner(
  event: Pick<RunStatusEvent, "scope" | "runId">,
  runs: readonly RunView[],
  pipelines: readonly Pipeline[],
  agents: readonly Agent[],
): SubsystemId | undefined {
  if (!ATTRIBUTABLE_SCOPES.has(event.scope) || !event.runId) return undefined;
  const run = runs.find(
    (r) => (r.kind === "pipeline" || r.kind === "agent") && r.runId === event.runId,
  );
  if (!run) return undefined;
  if (run.kind === "agent") {
    const agent = agents.find((a) => a.id === run.owner);
    return agent?.ownerSubsystem;
  }
  const pipeline = pipelines.find((p) => p.id === run.owner);
  return pipeline?.ownerSubsystem;
}

/**
 * One event → at most one flight. `undefined` when the owner can't be resolved
 * (see {@link resolveEventOwner}) OR the status is neither a start nor a report
 * (e.g. `paused-limit`, `interrupted`) — no particle either way, never a fallback
 * guess at direction.
 */
export function flightForEvent(
  event: Pick<RunStatusEvent, "scope" | "runId" | "status">,
  runs: readonly RunView[],
  pipelines: readonly Pipeline[],
  agents: readonly Agent[],
): EventFlight | undefined {
  const subsystemId = resolveEventOwner(event, runs, pipelines, agents);
  if (!subsystemId || !event.status) return undefined;
  if (STARTED_STATUSES.has(event.status)) return { from: "orb", to: subsystemId, subsystemId };
  if (REPORT_STATUSES.has(event.status)) return { from: subsystemId, to: "orb", subsystemId };
  return undefined;
}

// ---- rendering helpers (still pure — no React/DOM) --------------------------

/** Concurrency cap (design doc: "~12") — never a queue, a flood just thins the tail. */
export const MAX_PARTICLES = 12;

/** Append `item`, dropping the OLDEST entries first once over {@link MAX_PARTICLES}
 * — never batches into a synchronized burst, a real flight is simply not drawn once
 * the cap is already full of more recent ones. */
export function appendParticle<T>(list: readonly T[], item: T): T[] {
  const next = [...list, item];
  return next.length > MAX_PARTICLES ? next.slice(next.length - MAX_PARTICLES) : next;
}

/** Flight duration range, seconds (design doc: "~1.2–2s flight"). Phase 97
 * legibility pass raised the floor a touch (1.2 → 1.5) — the WebGL mote's
 * comet trail needs a little more travel time to read clearly at
 * full-viewport scale; the jitter width is unchanged, so the range simply
 * shifts to ~1.5–2.3s. */
const MIN_DURATION_S = 1.5;
const DURATION_JITTER_S = 0.8;

/**
 * A small, deterministic pseudo-random value in `[0, 1)` derived from `seed` — same
 * input, same output, always (CLAUDE.md: no `Math.random` in render). A one-pass
 * FNV-1a-style hash folded to the unit interval; not cryptographic, just enough
 * spread that consecutive event ids don't produce visibly-identical jitter.
 */
export function hashJitter(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** A flight's duration, seconds — deterministic per `seed` (pass the event's own
 * runId + status + a mount-order tiebreaker so two events landing in the same tick
 * don't animate in perfect lockstep). */
export function particleDuration(seed: string): number {
  return MIN_DURATION_S + hashJitter(seed) * DURATION_JITTER_S;
}
