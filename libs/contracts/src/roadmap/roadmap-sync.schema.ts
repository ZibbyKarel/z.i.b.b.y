import { z } from "zod";
import { RoadmapItemIdSchema } from "./roadmap-item.schema";

/**
 * One diagnostic note attached to a specific item during a sync (125b) — today
 * only "an attachment was skipped for exceeding a cap", but the shape is
 * generic so a later note (e.g. a tolerated GitHub `sub_issues` 404) can reuse
 * it without a contract change.
 */
export const RoadmapSyncItemNoteSchema = z.object({
  itemId: RoadmapItemIdSchema,
  note: z.string().min(1),
});
export type RoadmapSyncItemNote = z.infer<typeof RoadmapSyncItemNoteSchema>;

/**
 * The summary `POST /projects/:projectId/roadmap/sync` (125b) returns.
 * `imported`/`updated`/`archived` count items the upsert actually wrote;
 * `skipped` counts source items whose level-mapping `target` resolved to
 * `"ignore"` (see `resolveLevel`) — parsed but deliberately not turned into a
 * roadmap item at all. A project with no Jira/GitHub integration configured
 * returns all-zero counts, never an error (mirrors `ProjectPrService.
 * listOpen`'s "no link is not an error" posture).
 */
export const RoadmapSyncResultSchema = z.object({
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  notes: z.array(RoadmapSyncItemNoteSchema).default([]),
});
export type RoadmapSyncResult = z.infer<typeof RoadmapSyncResultSchema>;
