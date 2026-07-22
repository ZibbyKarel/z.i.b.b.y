/**
 * Pure-UI signal-kind catalog for the handoff-rule editor (P2 design doc,
 * `docs/superpowers/specs/2026-07-22-handoff-rule-inline-editor-design.md`). The
 * server (`HandoffRuleInputSchema.signalKind`) accepts any non-empty string — this
 * is only a picker convenience so the operator sees what each subsystem actually
 * emits instead of typing a free-text kind blind. No contract change.
 */
export const SUBSYSTEM_SIGNAL_KINDS: Partial<Record<string, readonly string[]>> = {
  sentinel: ["cve", "secret"],
  maestro: ["post-merge-red"],
  loom: ["god-node", "community", "cycle"],
  scout: ["research-artifact"],
};

export const ALL_SIGNAL_KINDS = [
  "cve",
  "secret",
  "post-merge-red",
  "god-node",
  "community",
  "cycle",
  "research-artifact",
] as const;

export type SignalKind = (typeof ALL_SIGNAL_KINDS)[number];

/** The signal kinds a given subsystem emits, or `[]` when it emits none (or is unknown). */
export function signalKindsFor(subsystemId: string): readonly string[] {
  return SUBSYSTEM_SIGNAL_KINDS[subsystemId] ?? [];
}

/** Whether `kind` is one of the catalog's known kinds — gates the friendly-label lookup. */
export function isKnownSignalKind(kind: string): kind is SignalKind {
  return (ALL_SIGNAL_KINDS as readonly string[]).includes(kind);
}
