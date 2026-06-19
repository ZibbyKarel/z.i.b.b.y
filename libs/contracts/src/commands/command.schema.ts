import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";

/**
 * A command's `id` IS the slash-command name (`/<id>`). It doubles as the on-disk
 * file name and the materialized `<id>.md` under a run's `.claude/commands/`, so it
 * reuses the agent id rules (filename-safe, no traversal).
 */
export const CommandIdSchema = AgentIdSchema;

/**
 * A custom Claude Code slash command (managed from the UI). On disk: one `<id>.md`
 * file with YAML frontmatter plus a Markdown body — exactly the Claude Code command
 * format. The runner MATERIALIZES every enabled command into each run's
 * `.claude/commands/` (the only way to make `/orchestrate`-style commands that
 * downloaded skills/agents depend on resolve — there is no `--commands` flag). The
 * frontmatter keys are kebab-case to match Claude Code (`argument-hint`,
 * `allowed-tools`, `disable-model-invocation`); `enabled` is ZIBBY-internal and is
 * stripped from the materialized file. `instructions` is the command body (with
 * `$ARGUMENTS` / `$1` substitution).
 */
export const CommandSchema = z.object({
  id: CommandIdSchema,
  /** Shown in the command list; also lets Claude Code surface it for model invocation. */
  description: z.string().optional(),
  /** Expected arguments, shown to the operator/agent (e.g. `[issue-number] [priority]`). */
  "argument-hint": z.string().optional(),
  /** Tools this command may use (restricts even if the session allows more). */
  "allowed-tools": z.array(z.string()).optional(),
  /** Model override for this command (free-form alias, e.g. `opus`). */
  model: z.string().optional(),
  /** When true, only a human `/name` can run it — Claude won't auto-invoke. */
  "disable-model-invocation": z.boolean().optional(),
  enabled: z.boolean().default(true),
  instructions: z.string().min(1),
});
export type Command = z.infer<typeof CommandSchema>;

/** Body accepted by `createCommand` — full entity (`id` + `instructions` required). */
export const CreateCommandSchema = CommandSchema;
export type CreateCommandInput = z.infer<typeof CreateCommandSchema>;

/** Body accepted by `updateCommand` — every field optional (partial), id excluded. */
export const UpdateCommandSchema = CommandSchema.omit({ id: true }).partial();
export type UpdateCommandInput = z.infer<typeof UpdateCommandSchema>;
