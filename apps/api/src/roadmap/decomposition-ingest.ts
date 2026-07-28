import type { DecompositionArtifact, RoadmapItem } from "@zibby/contracts";
import { collisionResistantId } from "../shared/file-storage";

/** One ordinal dropped instead of trusted — kept for the caller's diagnostics/logging. */
export interface DecompositionIngestResult {
  /** The minted child items — `parentId` set to the epic, `origin: "zibby-decomposed"`. */
  items: RoadmapItem[];
  /**
   * `dependsOn` ordinals dropped rather than resolved: out of range, a
   * self-reference, or a duplicate within the same entry. Never fails the
   * whole ingest — Law 4 treats the artifact exactly as strictly as an
   * imported issue body (`RoadmapSourceService`'s Jira/GitHub edges degrade
   * the same way: an unresolvable reference is dropped, not trusted, and
   * never aborts the rest of the item).
   */
  droppedEdges: number;
}

/**
 * Phase 125g — the ONE place a validated {@link DecompositionArtifact} becomes
 * real {@link RoadmapItem}s. Pure and deterministic: no I/O, no randomness
 * beyond id minting — mints every child's id itself (`collisionResistantId`,
 * same helper `createRoadmapItem` uses for a manual item), resolves each
 * entry's `dependsOn` ordinals to those freshly-minted ids, and sets
 * `parentId`/`origin`/`lifecycle` the way every other decomposed child must
 * carry them. The caller (`RoadmapDecompositionService`) is responsible for
 * persisting `items` (`RoadmapStore.put`) — this function never touches disk,
 * which is exactly what makes it independently testable and keeps "artifact ->
 * write" a single auditable path (the decomposition agent itself never writes
 * a roadmap file).
 *
 * Ordinal resolution is deliberately as strict as the shape validation that
 * already happened at the schema layer:
 *  - an ordinal `< 0` or `>= artifact.length` (out of range) is dropped,
 *  - an ordinal equal to the entry's OWN index (a self-reference) is dropped,
 *  - a repeated ordinal within one entry's `dependsOn` is deduped (kept once).
 * None of these ever throw or abort the item they're attached to — only the
 * one bad edge is dropped, mirroring the ownership-split posture the rest of
 * 125 already takes toward untrusted/partial upstream data.
 */
export function ingestDecomposition(
  artifact: DecompositionArtifact,
  epic: RoadmapItem,
  now: string,
): DecompositionIngestResult {
  const ids = artifact.map(() => collisionResistantId("roadmap"));
  let droppedEdges = 0;

  const items: RoadmapItem[] = artifact.map((entry, index) => {
    const seen = new Set<number>();
    const dependsOn: string[] = [];
    for (const ordinal of entry.dependsOn) {
      const inRange = ordinal >= 0 && ordinal < artifact.length;
      const selfRef = ordinal === index;
      const duplicate = seen.has(ordinal);
      if (!inRange || selfRef || duplicate) {
        droppedEdges += 1;
        continue;
      }
      seen.add(ordinal);
      // `ids[ordinal]` is guaranteed defined — `inRange` already bounds it.
      dependsOn.push(ids[ordinal] as string);
    }

    return {
      id: ids[index] as string,
      projectId: epic.projectId,
      level: "task",
      parentId: epic.id,
      name: entry.name,
      description: entry.description,
      source: { kind: "manual" },
      attachments: [],
      dependsOn,
      dependsOnFromSource: [],
      origin: "zibby-decomposed",
      lifecycle: "todo",
      runs: [],
      syncNotes: [],
      createdAt: now,
      updatedAt: now,
    };
  });

  return { items, droppedEdges };
}
