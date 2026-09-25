import type { Route } from "next";

/**
 * Every kind of row the palette can surface. Drives both the per-row leading
 * label (`CommandPaletteItem.kind`, via {@link CommandPaletteLabels.kind}) and
 * grouping (`CommandPaletteEntry.group`).
 */
export type CommandPaletteEntryKind =
  | "department"
  | "person"
  | "task"
  | "chain"
  | "goal"
  | "company"
  | "team"
  | "project"
  | "pipeline"
  | "skill"
  | "mcp"
  | "hook"
  | "command"
  | "automation"
  | "signal"
  | "note"
  | "setting"
  | "gate"
  | "action";

/** One row of the index — a group's own bucket, before filtering/capping. */
export type CommandPaletteGroupKey =
  | "actions"
  | "departments"
  | "people"
  | "tasks"
  | "chains"
  | "goals"
  | "companies"
  | "teams"
  | "projects"
  | "pipelines"
  | "registries"
  | "automations"
  | "signals"
  | "vault"
  | "settings"
  | "gates";

/** Actions the palette can carry out directly, without navigating first. */
export type CommandPaletteActionId = "new-task" | "approve-next" | "toggle-theme";

/**
 * One indexed, navigable (or runnable) row. `href` is informational only for a
 * plain navigation row — {@link CommandPaletteActionId} rows carry no `href` and
 * are resolved by the host at select time instead (their effect depends on live
 * state, e.g. which approval is oldest).
 */
export interface CommandPaletteEntry {
  id: string;
  group: CommandPaletteGroupKey;
  kind: CommandPaletteEntryKind;
  label: string;
  meta?: string;
  href?: Route;
  actionId?: CommandPaletteActionId;
}

/** Translated strings the pure builder needs — kept out of `lib/` so it never
 * imports `next-intl` and stays trivially unit-testable. */
export interface CommandPaletteLabels {
  kind: Record<CommandPaletteEntryKind, string>;
  group: Record<CommandPaletteGroupKey, string>;
  settingsSection: Record<string, string>;
  gateSection: Record<string, string>;
  actions: {
    newTask: string;
    approveNext: string;
    toggleTheme: string;
  };
}
