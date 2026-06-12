import { z } from "zod"

/** Vault tiers: curated `memory`, episodic `daily/`, thematic `knowledge/`. */
export const MemoryTierSchema = z.enum(["memory", "daily", "knowledge"])
export type MemoryTier = z.infer<typeof MemoryTierSchema>

/**
 * A single vault note. `id` is the note's basename (Obsidian-style, unique across
 * the vault); `links` are the `[[wiki-link]]` targets resolved to note ids;
 * `backlinks` are the notes that link back to it.
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
})
export type Note = z.infer<typeof NoteSchema>

/** An entry in the index/MOC view — the entry points for retrieval. */
export const IndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  tier: MemoryTierSchema,
})
export type IndexEntry = z.infer<typeof IndexEntrySchema>

/** The force-directed graph of wiki-links across the vault. */
export const MemoryGraphSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), label: z.string(), tier: MemoryTierSchema })),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
})
export type MemoryGraph = z.infer<typeof MemoryGraphSchema>

/** A single index-first search hit (no embeddings — explicit retrieval). */
export const SearchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  tier: MemoryTierSchema,
  snippet: z.string(),
})
export type SearchHit = z.infer<typeof SearchHitSchema>

/** Body accepted by the safe `daily/` append. */
export const AppendDailySchema = z.object({ text: z.string().min(1) })
export type AppendDailyInput = z.infer<typeof AppendDailySchema>

/**
 * A note id usable as a filesystem basename: starts alphanumeric, then up to 119
 * of `[a-zA-Z0-9._ -]` — no path separators or leading dot, so it can never
 * traverse out of its tier dir. Covers existing ids (`MEMORY`, `2026-06-12`,
 * `zibby-index`, `learned-<runId>`). Ids are unique across the *whole* vault.
 */
export const NoteIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/, "Invalid note id")
export type NoteId = z.infer<typeof NoteIdSchema>

/** Create a note in a chosen tier. The API assembles frontmatter from these fields. */
export const CreateNoteSchema = z.object({
  id: NoteIdSchema,
  tier: MemoryTierSchema,
  title: z.string().optional(),
  body: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
})
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>

/** Patch a note: any subset of title/body/frontmatter (frontmatter merges per key). */
export const UpdateNoteSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
})
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>

/** Append free text to an existing note (atomic read-modify-write). */
export const AppendNoteSchema = z.object({ text: z.string().min(1) })
export type AppendNoteInput = z.infer<typeof AppendNoteSchema>

/** Ensure a `[[target]]` wiki-link line exists in a MOC (the MOC is auto-created if absent). */
export const UpdateIndexLinkSchema = z.object({
  target: NoteIdSchema,
  label: z.string().optional(),
})
export type UpdateIndexLinkInput = z.infer<typeof UpdateIndexLinkSchema>
