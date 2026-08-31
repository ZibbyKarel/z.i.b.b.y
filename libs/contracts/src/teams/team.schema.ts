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
 * not a setting an operator can weaken. Nothing in the system can write to a
 * knowledge base, because no write tool exists.
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
