import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { isValidGitRemote } from "../projects/project.schema";

/** Filename-safe id — same constraint as agents/companies, no path traversal. */
export const TeamIdSchema = AgentIdSchema;

/**
 * True for a POSIX absolute path (`/…`), a Windows drive-absolute path
 * (`C:\…`/`C:/…`), or a UNC path (`\\server\share`). Dependency-free (no
 * `node:path` import — `libs/contracts` stays usable outside Node) and
 * deliberately permissive about which OS: the operator configures this host
 * path directly, and the API process may run on either.
 */
function isAbsoluteHostPath(p: string): boolean {
  return p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/**
 * Where a team's knowledge base lives.
 *
 * A discriminated union from day one even though v1 has a single member: a
 * company-level knowledge base is expected later and will NOT be a git folder —
 * it will live in Confluence or a similar wiki. Adding `kind: "confluence"`
 * must not disturb `kind: "vault"`.
 *
 * `readOnly` is a literal `true`, not a boolean: read-only is structural (Law 1),
 * not a setting an operator can weaken. ZIBBY agents never write; the only app writes are
 * operator-triggered: `kb/sync` (ff pull) and `kb/questions/resolve` (one new file in the
 * gitignored `inbox/`).
 */
export const KnowledgeBaseSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("vault"),
      /** Absolute host path, read in place. Never copied into ZIBBY's vault. */
      path: z.string().min(1).refine(isAbsoluteHostPath, {
        message: "must be an absolute path",
      }),
      gitRemote: z
        .string()
        .min(1)
        .refine(isValidGitRemote, { message: "unsupported git remote" })
        .optional(),
      readOnly: z.literal(true),
    })
    .strict(),
]);
export type KnowledgeBaseSource = z.infer<typeof KnowledgeBaseSourceSchema>;

/**
 * A team inside a company — the layer that owns a knowledge base.
 *
 * `companyId` is a bare optional string, deliberately NOT an FK-validated
 * reference: it mirrors `Project.companyId`, where a dangling id is tolerated
 * and resolved to "no company" at read time (Phase 68 binding decision).
 * Many teams per company; at most one company per team.
 */
export const TeamSchema = z.object({
  id: TeamIdSchema,
  name: z.string().min(1),
  companyId: z.string().optional(),
  desc: z.string().optional(),
  knowledgeBase: KnowledgeBaseSourceSchema.optional(),
});
export type Team = z.infer<typeof TeamSchema>;

export const CreateTeamSchema = TeamSchema;
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;

/**
 * Body accepted by `updateTeam` — every field optional (partial update), id
 * excluded. `companyId` and `knowledgeBase` are re-widened to also accept
 * `null` (mirrors `UpdateProjectSchema.companyId`, Phase 72): a JSON PATCH
 * body silently drops `undefined`-valued keys on the wire, so "unset this
 * field" is otherwise inexpressible for an already-linked team — `null` is
 * the explicit "clear it" signal the storage layer acts on, while
 * `undefined`/absent still means "leave the current value alone".
 */
export const UpdateTeamSchema = TeamSchema.omit({ id: true }).partial().extend({
  companyId: z.string().optional().nullable(),
  knowledgeBase: KnowledgeBaseSourceSchema.optional().nullable(),
});
export type UpdateTeamInput = z.infer<typeof UpdateTeamSchema>;

/** One markdown note of a team's read-only knowledge base (`GET /teams/:id/kb/notes`). */
export const TeamKbNoteSummarySchema = z.object({
  /** Repo-relative path, forward-slash-joined — the note's unique id. */
  id: z.string(),
  title: z.string(),
  /** Top-level folder of the note ("" for a note at the KB root). */
  folder: z.string(),
});
export type TeamKbNoteSummary = z.infer<typeof TeamKbNoteSummarySchema>;

/** One note's capped body plus its raw `[[wikilink]]` targets (`GET /teams/:id/kb/note`). */
export const TeamKbNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  links: z.array(z.string()),
});
export type TeamKbNote = z.infer<typeof TeamKbNoteSchema>;

/** One open question or agreement lifted from a meeting note (`GET /teams/:id/kb/digest`). */
export const TeamKbDigestItemSchema = z.object({
  text: z.string().max(300),
  /** Repo-relative path of the source note (KB-relative, forward-slash-joined). */
  noteId: z.string(),
  noteTitle: z.string(),
  /** The note's frontmatter `date`, when present. */
  date: z.string().optional(),
});
export type TeamKbDigestItem = z.infer<typeof TeamKbDigestItemSchema>;

export const TeamKbDigestSchema = z.object({
  questions: z.array(TeamKbDigestItemSchema),
  decisions: z.array(TeamKbDigestItemSchema),
});
export type TeamKbDigest = z.infer<typeof TeamKbDigestSchema>;

/** Resolve one open question (`POST /teams/:id/kb/questions/resolve`): writes an answer note to the KB `inbox/`. */
export const ResolveTeamKbQuestionSchema = z.object({
  noteId: z.string().min(1),
  question: z.string().min(1).max(300),
  answer: z.string().trim().min(1).max(20000),
});
export type ResolveTeamKbQuestionInput = z.infer<typeof ResolveTeamKbQuestionSchema>;

/** The written answer note; `id` is its KB-relative path (e.g. `inbox/answer-who-1a2b3c.md`). */
export const TeamKbAnswerSchema = z.object({ id: z.string(), title: z.string() });
export type TeamKbAnswer = z.infer<typeof TeamKbAnswerSchema>;

/**
 * Ingest status of a team KB (`GET /teams/:id/kb/ingest`): the registered project
 * whose path IS the KB repo (the `team-kb-ingest` workflow runs on it; null when none)
 * and the tail of the KB's own `_meta/log.md`.
 */
export const TeamKbIngestSchema = z.object({
  projectId: z.string().nullable(),
  log: z.array(z.object({ line: z.string() })),
});
export type TeamKbIngest = z.infer<typeof TeamKbIngestSchema>;
