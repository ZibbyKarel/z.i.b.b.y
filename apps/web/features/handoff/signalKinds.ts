import type { HandoffSignalKind } from "@zibby/contracts";
import type { useTranslations } from "next-intl";

/**
 * i18n/type helpers for the handoff-rule editor's signal-kind picker (Slot B2,
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`).
 * Scoping a producer's kinds and the built-in/operator catalog itself now live
 * server-side in the signal-kind registry (`useSignalKindsQuery`) — this module
 * only keeps the built-in type-guard and the cs/en label lookup for the 7 seeded
 * kinds (`SUBSYSTEM_SIGNAL_KINDS`/`signalKindsFor` were removed with Slot B2; the
 * registry's `from` field is the scoping source of truth now).
 */
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

/** Whether `kind` is one of the built-in catalog's known kinds — gates the friendly-label lookup. */
export function isKnownSignalKind(kind: string): kind is SignalKind {
  return (ALL_SIGNAL_KINDS as readonly string[]).includes(kind);
}

/**
 * Display label for a registry signal kind: a built-in (`isKnownSignalKind(kind.id)`)
 * renders via the localized `t(`signalKind.${id}`)` catalog (cs/en); an
 * operator-registered kind renders its stored `label` verbatim — the operator wrote
 * one language, no forced bilingual input.
 */
export function signalKindLabel(
  kind: HandoffSignalKind,
  t: ReturnType<typeof useTranslations<"subsystems.handoff">>,
): string {
  return isKnownSignalKind(kind.id) ? t(`signalKind.${kind.id}`) : kind.label;
}

/** Description counterpart of `signalKindLabel` — same built-in/operator split. */
export function signalKindDescription(
  kind: HandoffSignalKind,
  t: ReturnType<typeof useTranslations<"subsystems.handoff">>,
): string {
  return isKnownSignalKind(kind.id) ? t(`signalKindDesc.${kind.id}`) : kind.description;
}
