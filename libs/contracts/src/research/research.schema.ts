import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * The research / intelligence layer (M6) — "ZIBBY brings the world to the operator".
 * Operator-level (not per-project) config: a set of interests and watched sources.
 * A nightly/dispatched pass fetches each source through a pluggable adapter seam,
 * ranks items by interest-term overlap, and folds a digest into the morning briefing.
 *
 * Files are the source of truth: the config lives in `data/research-config.json`
 * and the latest digest is mirrored as the vault note `intelligence/digest`.
 */

/** The kind of a watched source — drives which adapter fetches it. */
export const ResearchSourceKindSchema = z.enum([
  "rss",
  "hn",
  "producthunt",
  "tech",
  "competitor",
  "finance",
]);
export type ResearchSourceKind = z.infer<typeof ResearchSourceKindSchema>;

/** One watched source. `url` is optional (HN/PH have well-known feeds). */
export const ResearchSourceSchema = z.object({
  id: z.string().min(1),
  kind: ResearchSourceKindSchema,
  label: z.string().min(1),
  url: z.string().url().optional(),
  enabled: z.boolean().default(true),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

/**
 * Operator research config. `financeWatch` is overview-only by contract — a finance
 * source surfaces signal, never advice (north-star: "FinanceWatcher — overview only,
 * never advice").
 */
export const ResearchConfigSchema = z.object({
  interests: z.array(z.string().min(1)).default([]),
  sources: z.array(ResearchSourceSchema).default([]),
  financeWatch: z.boolean().default(false),
});
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

/** One ranked digest item. `relevance` is the interest-overlap score in [0,1]. */
export const ResearchItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().optional(),
  summary: z.string(),
  source: ResearchSourceKindSchema,
  sourceId: z.string(),
  relevance: z.number().min(0).max(1),
  matchedInterests: z.array(z.string()).default([]),
  publishedAt: z.string().optional(),
});
export type ResearchItem = z.infer<typeof ResearchItemSchema>;

/** The assembled digest — ranked items, newest pass wins (one note per day). */
export const ResearchDigestSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  items: z.array(ResearchItemSchema),
});
export type ResearchDigest = z.infer<typeof ResearchDigestSchema>;
