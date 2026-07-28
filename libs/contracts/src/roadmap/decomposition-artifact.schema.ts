import { z } from "zod";

/**
 * Phase 125g — the ONLY shape the decomposition agent is asked to produce: a
 * flat JSON array, one entry per proposed child task. `dependsOn` holds
 * ordinals (0-based indices into THIS SAME array), never ids — the agent
 * mints no ids and cannot know what ZIBBY will assign, so an ordinal is the
 * only reference it can make that a deterministic ingest can later resolve.
 *
 * This schema validates SHAPE only (types, bounds) — it is the first of two
 * checks the raw artifact goes through. It says nothing about whether a given
 * `dependsOn` ordinal is in range, self-referential, or duplicated within one
 * entry; that is a SEMANTIC property of the whole array (a single entry can't
 * validate it against its siblings), so it is checked separately by the
 * deterministic ingest (`apps/api/src/roadmap/decomposition-ingest.ts`),
 * which drops an invalid edge rather than rejecting the whole item — the same
 * graceful-degradation posture `RoadmapSourceService`'s Jira/GitHub import
 * takes toward a malformed field from an external system (Law 4: agent output
 * is exactly as untrusted as an imported issue body).
 *
 * Capped at 200 entries — the same order of magnitude `PlayRoadmapItemsSchema`
 * caps a bulk play at; generous headroom over any epic a human would
 * plausibly hand-decompose, while still bounding a single ingest's cost.
 */
export const DecompositionArtifactItemSchema = z.object({
  name: z.string().min(1).max(512),
  description: z.string().default(""),
  /** 0-based indices into the artifact array — never own index, never out of range (checked at ingest). */
  dependsOn: z.array(z.number().int().nonnegative()).max(200).default([]),
});
export type DecompositionArtifactItem = z.infer<typeof DecompositionArtifactItemSchema>;

export const DecompositionArtifactSchema = z.array(DecompositionArtifactItemSchema).max(200);
export type DecompositionArtifact = z.infer<typeof DecompositionArtifactSchema>;
