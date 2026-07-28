import { z } from "zod";
import { RoadmapItemIdSchema } from "./roadmap-item.schema";

/**
 * Body for `POST /projects/:projectId/roadmap/play` (125e) — bulk play,
 * "zařadit vše" from a multi-select on the board. Order matters: the gate
 * stamps each id's `enqueuedAt` in array order (millisecond-spaced) so the
 * FIFO drain releases them in exactly the order the operator selected them,
 * even when several land in the same event-loop tick. Capped at 200 — the
 * same order of magnitude as a whole project's roadmap, generous headroom
 * over any realistic multi-select.
 */
export const PlayRoadmapItemsSchema = z.object({
  itemIds: z.array(RoadmapItemIdSchema).min(1).max(200),
});
export type PlayRoadmapItemsInput = z.infer<typeof PlayRoadmapItemsSchema>;

/**
 * Body for `POST /projects/:projectId/roadmap/items/:itemId/override` (125e) —
 * the Tier-3 "pustit i tak" escape hatch. A plain boolean rather than an
 * action-only `EmptyBodySchema`: the operator can also clear the override
 * (`false`) to put a re-added dependency back in force, without a separate
 * route. Setting it to `true` on an item that is currently `enqueued` and
 * blocked releases it immediately (the gate drains right after applying it);
 * on any other lifecycle it only sets the flag for the next play/drain.
 */
export const OverrideRoadmapItemSchema = z.object({
  overrideBlocked: z.boolean(),
});
export type OverrideRoadmapItemInput = z.infer<typeof OverrideRoadmapItemSchema>;
