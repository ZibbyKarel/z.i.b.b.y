import { z } from "zod";

/** The two source kinds the level-mapping table distinguishes. */
export const LevelMappingKindSchema = z.enum(["jira", "github"]);
export type LevelMappingKind = z.infer<typeof LevelMappingKindSchema>;

/** Where an external level maps to: an internal roadmap level, or dropped entirely. */
export const LevelMappingTargetSchema = z.enum(["epic", "task", "ignore"]);
export type LevelMappingTarget = z.infer<typeof LevelMappingTargetSchema>;

/** One row of the mapping table (`/settings?tab=tasks`). */
export const LevelMappingEntrySchema = z.object({
  kind: LevelMappingKindSchema,
  /** The raw level as the source reports it — "Story", "Sub-task", "Milestone". */
  externalLevel: z.string().min(1),
  target: LevelMappingTargetSchema,
});
export type LevelMappingEntry = z.infer<typeof LevelMappingEntrySchema>;

/** The whole global table — a flat list, one entry per (kind, externalLevel). */
export const LevelMappingSchema = z.object({
  entries: z.array(LevelMappingEntrySchema),
});
export type LevelMapping = z.infer<typeof LevelMappingSchema>;

/**
 * The seed shipped on first read (`LevelMappingStore`, 125a) before any sync
 * has ever run and before the operator has edited anything. Per the master
 * plan: Jira `Epic → epic`; `Story`/`Task`/`Bug`/`Sub-task` → `task`
 * (sub-tasks are flattened, 125b); `Initiative → ignore` (out of scope —
 * only epic/task are first-class levels). GitHub `Milestone → epic`,
 * `Issue → task`.
 */
export const DEFAULT_LEVEL_MAPPING: LevelMapping = {
  entries: [
    { kind: "jira", externalLevel: "Epic", target: "epic" },
    { kind: "jira", externalLevel: "Story", target: "task" },
    { kind: "jira", externalLevel: "Task", target: "task" },
    { kind: "jira", externalLevel: "Bug", target: "task" },
    { kind: "jira", externalLevel: "Sub-task", target: "task" },
    { kind: "jira", externalLevel: "Initiative", target: "ignore" },
    { kind: "github", externalLevel: "Milestone", target: "epic" },
    { kind: "github", externalLevel: "Issue", target: "task" },
  ],
};

/**
 * Resolve an external level to its mapped target, or `undefined` when the
 * (kind, externalLevel) pair has never been seen — the caller (the sync
 * tick, via `LevelMappingStore.ensureLevels`) appends it with `target:
 * "task"` so the table populates itself from reality instead of a guess.
 *
 * Matching is CASE-INSENSITIVE (`externalLevel.trim().toLowerCase()` on both
 * sides): a Jira/GitHub instance's exact casing isn't a contract either
 * service guarantees, and an operator hand-editing the table shouldn't have
 * to match case exactly for the mapping to take. The ORIGINAL casing is what
 * gets stored/displayed — only the comparison folds case, never the data.
 */
export function resolveLevel(
  mapping: LevelMapping,
  kind: LevelMappingKind,
  externalLevel: string,
): LevelMappingTarget | undefined {
  const needle = externalLevel.trim().toLowerCase();
  const found = mapping.entries.find(
    (entry) => entry.kind === kind && entry.externalLevel.trim().toLowerCase() === needle,
  );
  return found?.target;
}
