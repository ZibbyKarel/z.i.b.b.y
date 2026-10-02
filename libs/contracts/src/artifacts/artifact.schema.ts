import { z } from "zod";

/**
 * Where a durable artifact lives (what its `locator` means):
 * - `vault-note` — a note in the memory vault; `locator` is the note id.
 * - `project-file` — a file delivered into the project checkout/worktree;
 *   `locator` is the project-relative path.
 * - `pr` — an opened pull request; `locator` is the PR URL.
 */
export const ArtifactKindSchema = z.enum(["vault-note", "project-file", "pr"]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

/** The run that produced an artifact — the provenance edge back to the work. */
export const ArtifactProducerSchema = z.object({
  /** The producing run's ref (workflow run id today; other run kinds later). */
  runRef: z.string().min(1),
  workflowId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});
export type ArtifactProducer = z.infer<typeof ArtifactProducerSchema>;

/**
 * A durable artifact's provenance record (N2a) — written at delivery time by the
 * workflow's terminal sinks, one plain-JSON file per record on disk (files are the
 * source of truth; no graph store). This is the registry the N2 chain primitive
 * consumes: a downstream workflow binds its input to an upstream record, so a chain
 * survives restart and an artifact stays reusable long after its run is evicted.
 */
export const ArtifactRecordSchema = z.object({
  /** `<runRef>_<slug(from)>` — stable per run+artifact, so re-delivery replaces. */
  id: z.string().min(1),
  kind: ArtifactKindSchema,
  /** Kind-dependent address: note id, project-relative path, or PR URL. */
  locator: z.string().min(1),
  /** The phase handoff name the sink drew from (the workflow's `produces`). */
  from: z.string().min(1),
  producedBy: ArtifactProducerSchema,
  createdAt: z.string().datetime(),
});
export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;

/** Filters for listing artifacts (all optional — default is everything, newest-first). */
export const ArtifactListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
});
export type ArtifactListQuery = z.infer<typeof ArtifactListQuerySchema>;
