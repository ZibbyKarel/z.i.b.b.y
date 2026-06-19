import { z } from "zod";
import { AGENT_ID_REGEX } from "../agents/agent.schema";

/**
 * Allowed shape of a hook `id` — the same restrictive pattern agents/skills use
 * (the id doubles as the on-disk file name, so no separators / traversal).
 * Defense in depth: the storage layer re-validates independently.
 */
export const HookIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(AGENT_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'");

/**
 * The Claude Code lifecycle events a hook can register on. A hook is a shell
 * command Claude Code runs at that point in a session (see the runner's
 * `--settings` wiring). `PreToolUse`/`PostToolUse` may scope to a tool via
 * `matcher`; the rest fire regardless of matcher.
 */
export const HookEventSchema = z.enum([
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
]);
export type HookEvent = z.infer<typeof HookEventSchema>;

/**
 * A custom Claude Code hook (managed from the UI, merged into every run's
 * `--settings`). On disk: one `<id>.json` under `data/hooks`. These are PURELY
 * ADDITIVE — the runner always keeps the locked approval hook first and refuses
 * any custom `PreToolUse`/`Bash` hook, so a stored hook can never weaken the
 * approval gate (Law 1). `command` is a shell command; `timeout` is in seconds.
 */
export const HookSchema = z.object({
  id: HookIdSchema,
  name: z.string().min(1).optional(),
  desc: z.string().optional(),
  event: HookEventSchema,
  /**
   * Tool-name matcher for `PreToolUse`/`PostToolUse` (e.g. `"Bash"`, `"Edit|Write"`).
   * Empty / omitted matches every tool. Ignored for non-tool events.
   */
  matcher: z.string().optional(),
  /** Shell command Claude Code runs when the hook fires. */
  command: z.string().min(1),
  /** Hard timeout in seconds before Claude Code kills the hook. */
  timeout: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
});
export type Hook = z.infer<typeof HookSchema>;

/** Body accepted by `createHook` — full entity (`id`, `event`, `command` required). */
export const CreateHookSchema = HookSchema;
export type CreateHookInput = z.infer<typeof CreateHookSchema>;

/** Body accepted by `updateHook` — every field optional (partial), id excluded. */
export const UpdateHookSchema = HookSchema.omit({ id: true }).partial();
export type UpdateHookInput = z.infer<typeof UpdateHookSchema>;
