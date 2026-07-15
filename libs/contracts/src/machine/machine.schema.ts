import { z } from "zod";

/**
 * Controlling the machine (N5a) — ZIBBY acting on the operator's computer
 * beyond the repo. Every action is Tier-3 by construction: proposing computes a
 * dry-run preview and parks an approval; only the operator's approve executes.
 * The action vocabulary is CLOSED and grows explicitly (the activity-kind
 * discipline) — v1 ships the reference task "rename files in a named folder".
 */
export const RenameFilesActionSchema = z.object({
  kind: z.literal("rename-files"),
  /** Absolute path to an existing directory the operator named. */
  folder: z.string().min(1).max(2048),
  /** Literal substring to find in file names (basenames only — never paths). */
  find: z.string().min(1).max(2048),
  /** Replacement (may be empty = delete the substring from the name). */
  replace: z.string(),
});
export type RenameFilesAction = z.infer<typeof RenameFilesActionSchema>;

/**
 * The second reference task (N5b): open Apple Maps with a search query
 * (`open "maps://?q=…"`). Execution only opens a window — reversible and
 * low-risk — but it still goes through the gate: nothing executes on the
 * operator's machine silently.
 */
export const OpenMapsActionSchema = z.object({
  kind: z.literal("open-maps"),
  /** What to search for — a place, an address, "nearest pharmacy", … */
  query: z.string().min(1).max(2048),
});
export type OpenMapsAction = z.infer<typeof OpenMapsActionSchema>;

/**
 * The third reference task (N5c): open a folder in the operator's file manager
 * (macOS `open /path`). Reversible and low-risk — it only pops a Finder window —
 * but it still goes through the gate: nothing on the operator's machine runs
 * silently, even a plain "show me this folder".
 */
export const OpenFolderActionSchema = z.object({
  kind: z.literal("open-folder"),
  /** Absolute path to an existing directory the operator named. */
  path: z.string().min(1).max(2048),
});
export type OpenFolderAction = z.infer<typeof OpenFolderActionSchema>;

/**
 * The fourth reference task (N5d): open an arbitrary web address in the
 * operator's default browser (macOS `open <url>`). Reversible and low-risk — it
 * only pops a browser tab — but it STILL goes through the gate: nothing on the
 * operator's machine runs silently, even a plain "open this link". The scheme is
 * restricted to http(s) at execution time (fail-closed) so inbound content can
 * never coax a `file:`/`javascript:` scheme through the browser.
 */
export const OpenUrlActionSchema = z.object({
  kind: z.literal("open-url"),
  /** The web address to open — a valid http(s) URL. */
  url: z.string().url(),
});
export type OpenUrlAction = z.infer<typeof OpenUrlActionSchema>;

export const MachineActionSchema = z.discriminatedUnion("kind", [
  RenameFilesActionSchema,
  OpenMapsActionSchema,
  OpenFolderActionSchema,
  OpenUrlActionSchema,
]);
export type MachineAction = z.infer<typeof MachineActionSchema>;

/**
 * Lifecycle: `proposed` (preview computed, approval parked) → `executed`
 * (operator approved; performed exactly once) / `rejected` (operator declined;
 * nothing touched) / `failed` (approved but execution hit an error — recorded,
 * never crashes).
 */
export const MachineActionStateSchema = z.enum(["proposed", "executed", "rejected", "failed"]);
export type MachineActionState = z.infer<typeof MachineActionStateSchema>;

/** One planned rename — the preview doubles as the old→new audit map. */
export const RenamePreviewEntrySchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type RenamePreviewEntry = z.infer<typeof RenamePreviewEntrySchema>;

/**
 * The durable record of one machine action (files are the source of truth —
 * unlike the in-memory jira-issue map, a restart keeps the gate resumable).
 * `preview` is computed at propose time and is exactly what an approve
 * executes; it stays on the record afterwards as the reversibility map.
 */
export const MachineActionRecordSchema = z.object({
  id: z.string().min(1),
  action: MachineActionSchema,
  preview: z.array(RenamePreviewEntrySchema),
  state: MachineActionStateSchema,
  /** The Tier-3 approval gating this action. */
  approvalId: z.string().optional(),
  requestedAt: z.string().datetime(),
  executedAt: z.string().datetime().optional(),
  /** Present when state is `failed` — what went wrong, verbatim. */
  error: z.string().optional(),
});
export type MachineActionRecord = z.infer<typeof MachineActionRecordSchema>;

/** Body accepted by `proposeMachineAction` — just the action; ZIBBY previews it. */
export const ProposeMachineActionSchema = z.object({ action: MachineActionSchema });
export type ProposeMachineActionInput = z.infer<typeof ProposeMachineActionSchema>;

/**
 * Phase 76 — per-machine, never-synced settings (`.zibby/data/machine/config.json`,
 * gitignored). `.strict()` so an unknown key can never smuggle a fifth knob in
 * unnoticed; `cloneRoot` is the local directory new project clones land in
 * (`<cloneRoot>/<project.id>`) when a project isn't already present at its
 * canonical `path` on this machine. Extensible later — this is deliberately the
 * one-field v1, not a place to accrete unrelated machine settings.
 */
export const MachineConfigSchema = z
  .object({
    cloneRoot: z.string().min(1),
  })
  .strict();
export type MachineConfig = z.infer<typeof MachineConfigSchema>;

/** Body accepted by `updateMachineConfig` — partial patch merged over the current config. */
export const UpdateMachineConfigSchema = MachineConfigSchema.partial();
export type UpdateMachineConfigInput = z.infer<typeof UpdateMachineConfigSchema>;
