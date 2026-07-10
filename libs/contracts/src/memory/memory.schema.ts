import { z } from "zod";

/** Vault tiers: curated `memory`, episodic `daily/`, thematic `knowledge/`. */
export const MemoryTierSchema = z.enum(["memory", "daily", "knowledge"]);
export type MemoryTier = z.infer<typeof MemoryTierSchema>;

/**
 * The four durable-note kinds (Fáze 3 typed memory). A pure classification of
 * what a note IS, orthogonal to its tier (where it lives): a `decision` can sit
 * in `knowledge/` just as easily as a `fact`. Kept a closed, small enum — free-form
 * categorization already exists via `tags`.
 */
export const NoteTypeSchema = z.enum(["decision", "preference", "fact", "pattern"]);
export type NoteType = z.infer<typeof NoteTypeSchema>;

/**
 * A single vault note. `id` is the note's basename (Obsidian-style, unique across
 * the vault); `links` are the `[[wiki-link]]` targets resolved to note ids;
 * `backlinks` are the notes that link back to it. `type`/`tags` are typed
 * frontmatter fields (Fáze 3) surfaced at the top level for convenience — they are
 * still stored as plain frontmatter keys, so an untyped/older note simply omits
 * them (optional, backwards compatible). `raw` is likewise an optional/backwards-
 * compatible typed frontmatter field: it marks the note as unprocessed "halda"
 * pending the nightly triage sweep — usable on ANY tier, not just a dedicated
 * inbox (absent/`false` means "already triaged or never needed it").
 */
export const NoteSchema = z.object({
  id: z.string().min(1),
  path: z.string(),
  tier: MemoryTierSchema,
  title: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  links: z.array(z.string()),
  backlinks: z.array(z.string()).optional(),
  body: z.string().optional(),
  type: NoteTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  raw: z.boolean().optional(),
});
export type Note = z.infer<typeof NoteSchema>;

/** An entry in the index/MOC view — the entry points for retrieval. */
export const IndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  tier: MemoryTierSchema,
  /**
   * The owning project (M7 multi-project isolation), derived from the note's
   * `project:` frontmatter or its `type: project` profile id. Absent → a global note
   * visible to every run; present → only a run in that project may ground on it.
   */
  project: z.string().optional(),
});
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

/** The force-directed graph of wiki-links across the vault. */
export const MemoryGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      tier: MemoryTierSchema,
      /**
       * The owning project (Fáze 11 project context) — same derivation as
       * {@link IndexEntrySchema}'s `project` (`ownerProjectOf`). Optional and
       * absent for a global note, so older payloads stay valid.
       */
      project: z.string().optional(),
    }),
  ),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});
export type MemoryGraph = z.infer<typeof MemoryGraphSchema>;

/** A single index-first search hit (no embeddings — explicit retrieval). */
export const SearchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  tier: MemoryTierSchema,
  snippet: z.string(),
  /** Owning project of the hit note (Fáze 11) — absent for a global note. */
  project: z.string().optional(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

/** Body accepted by the safe `daily/` append. */
export const AppendDailySchema = z.object({ text: z.string().min(1) });
export type AppendDailyInput = z.infer<typeof AppendDailySchema>;

/**
 * A note id usable as a filesystem basename: starts alphanumeric, then up to 119
 * of `[a-zA-Z0-9._ -]` — no path separators or leading dot, so it can never
 * traverse out of its tier dir. Covers existing ids (`MEMORY`, `2026-06-12`,
 * `zibby-index`, `learned-<runId>`). Ids are unique across the *whole* vault.
 */
export const NoteIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/, "Invalid note id");
export type NoteId = z.infer<typeof NoteIdSchema>;

/**
 * Create a note in a chosen tier. The API assembles frontmatter from these fields
 * (`type`/`tags`/`raw` fold into frontmatter alongside `title` — see
 * `vault.service.ts`). `dedupe` is a write-OPTION, not a note field: it is never
 * persisted, it only tells `VaultService.createNote` to run `findSimilar` first
 * and refuse (via `SimilarNoteError`) instead of writing a near-duplicate.
 * Defaults to `false` so existing callers keep today's exact-id-collision-only
 * behavior. `raw` marks the note as unprocessed "halda" pending nightly triage
 * (optional, backwards compatible — see `NoteSchema`).
 *
 * `tier` is OPTIONAL here (unlike `NoteSchema.tier`, which stays required — a
 * stored note always has a resolved tier): when omitted, this is the
 * zero-friction quick-capture path, and the server defaults `tier` to
 * `"knowledge"` and forces `raw: true`.
 */
export const CreateNoteSchema = z.object({
  id: NoteIdSchema,
  tier: MemoryTierSchema.optional(),
  title: z.string().optional(),
  body: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  type: NoteTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  dedupe: z.boolean().optional(),
  raw: z.boolean().optional(),
});
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

/**
 * Patch a note: any subset of title/body/frontmatter/raw (frontmatter merges per
 * key). `raw` is optional/backwards compatible — see `NoteSchema`.
 */
export const UpdateNoteSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  raw: z.boolean().optional(),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;

/** Append free text to an existing note (atomic read-modify-write). */
export const AppendNoteSchema = z.object({ text: z.string().min(1) });
export type AppendNoteInput = z.infer<typeof AppendNoteSchema>;

/** Ensure a `[[target]]` wiki-link line exists in a MOC (the MOC is auto-created if absent). */
export const UpdateIndexLinkSchema = z.object({
  target: NoteIdSchema,
  label: z.string().optional(),
});
export type UpdateIndexLinkInput = z.infer<typeof UpdateIndexLinkSchema>;

/**
 * Bulk-import request (phase 112): copy every `.md`/`.txt` file under a
 * server-side `sourcePath` into the halda queue (`dataDir("import")`) for the
 * existing nightly triage sweep to pick up — other file types are skipped and
 * counted, never silently dropped. `distillNow` opts into firing the distiller
 * immediately (detached) instead of waiting for the nightly `memory-distill` cron.
 */
export const ImportRequestSchema = z.object({
  sourcePath: z.string().min(1),
  distillNow: z.boolean().optional().default(false),
});
export type ImportRequestInput = z.infer<typeof ImportRequestSchema>;

/**
 * Result of a bulk import: how many files were staged into the halda queue vs.
 * skipped (unsupported type, oversized, unreadable, ...), a breakdown of skip
 * reasons (optional/backwards compatible), and whether `distillNow` triggered an
 * immediate (detached) distiller run.
 */
export const ImportResultSchema = z.object({
  staged: z.number().int(),
  skipped: z.number().int(),
  skippedByReason: z.record(z.string(), z.number()).optional(),
  distillTriggered: z.boolean(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
