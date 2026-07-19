import type { SubsystemId } from "@zibby/contracts";
import { useChainsQuery } from "../chains";
import { usePipelinesQuery } from "../pipelines";
import type { RunView } from "../runs/run";

/**
 * The two id→subsystem lookups a run's owner attribution is joined through —
 * built once per render from the already-fetched pipeline/chain catalogs (the
 * SAME lists `RosterTab` and `AktivitaTab` fetch for this drawer; see
 * {@link useOwnerSubsystemMaps}'s doc comment for why this is a client join,
 * not a new endpoint).
 */
export interface OwnerSubsystemMaps {
  pipelineSubsystem: Map<string, SubsystemId>;
  chainSubsystem: Map<string, SubsystemId>;
}

/**
 * Shared run→subsystem join (extracted from `AktivitaTab`'s original inline
 * `ownedPipelineIds`/`ownedChainIds` Sets — F2, `docs/plans/hud2chat-F2-archive.md`,
 * decision D8) so the `/archiv` page's "group by subsystem" mode and the
 * subsystem drawer's Aktivita tab read the SAME attribution instead of two
 * copies drifting apart.
 *
 * D8: only a `pipeline` or `chain` run ever carries a subsystem — it comes from
 * `Pipeline.ownerSubsystem`/`Chain.ownerSubsystem` on the run's owning
 * definition, joined by id (`run.owner`). An `agent` or `goal` run has NO
 * subsystem at all (there is no `ownerSubsystem` field on an agent/goal
 * definition) — callers must treat `runSubsystemId(...) === null` as an
 * explicit "bez subsystému" bucket, never hide those runs.
 *
 * Client-side join over the already-fetched catalogs (`usePipelinesQuery`,
 * `useChainsQuery`) — no new endpoint, no `ownerSubsystem` query param on the
 * unified runs feed, mirroring `AktivitaTab`'s original reasoning: the two
 * catalogs are small, already cached, and already fetched by sibling drawer
 * tabs (`RosterTab`), so a second endpoint would only pay for itself once the
 * catalogs got too large to fetch in full, which they aren't.
 */
export function useOwnerSubsystemMaps(): OwnerSubsystemMaps {
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: chains = [] } = useChainsQuery();

  const pipelineSubsystem = new Map<string, SubsystemId>();
  for (const p of pipelines) if (p.ownerSubsystem) pipelineSubsystem.set(p.id, p.ownerSubsystem);

  const chainSubsystem = new Map<string, SubsystemId>();
  for (const c of chains) if (c.ownerSubsystem) chainSubsystem.set(c.id, c.ownerSubsystem);

  return { pipelineSubsystem, chainSubsystem };
}

/**
 * The subsystem a single run is attributed to, or `null` when it has none —
 * either because it's an `agent`/`goal` run (no subsystem concept applies at
 * all, D8) or because its owning pipeline/chain has no `ownerSubsystem` set.
 * Both cases are indistinguishable to a caller and BOTH belong in an explicit
 * "bez subsystému" group — never filtered out silently.
 */
export function runSubsystemId(
  run: Pick<RunView, "kind" | "owner">,
  maps: OwnerSubsystemMaps,
): SubsystemId | null {
  if (run.kind === "pipeline") return maps.pipelineSubsystem.get(run.owner) ?? null;
  if (run.kind === "chain") return maps.chainSubsystem.get(run.owner) ?? null;
  return null;
}
