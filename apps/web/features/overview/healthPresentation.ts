import type { DotTone } from "@zibby/design-system";
import type { SubsystemHealth } from "@zibby/contracts";
import type { MessageKey } from "apps/web/i18n/keys";

/** The HudPanel tones the health banner uses. */
export type HealthTone = "ok" | "warn" | "bad";

export interface HealthPresentation {
  tone: HealthTone;
  dotTone: DotTone;
  /** Pulse the dot only while a state is transient (connecting). */
  pulse: boolean;
  label: MessageKey;
  detail: MessageKey;
}

export interface HealthSignals {
  /** First fetch still in flight — nothing known yet. */
  isConnecting: boolean;
  /** Last health poll succeeded (the API answered). */
  isOnline: boolean;
  /** The API answered but reported `status: "degraded"` (claude preflight failing). */
  isDegraded: boolean;
}

/**
 * Pure derivation of the overview health banner. Degraded sits between online
 * and offline: the API is up (so the dashboard works) but claude-shaped runs
 * would be refused — warn tone, no pulse (it is a stable state, not a transition).
 */
export function deriveHealthPresentation({
  isConnecting,
  isOnline,
  isDegraded,
}: HealthSignals): HealthPresentation {
  if (isConnecting) {
    return {
      tone: "warn",
      dotTone: "wait",
      pulse: true,
      label: "overview.systemConnecting",
      detail: "overview.apiUnreachable",
    };
  }
  if (!isOnline) {
    return {
      tone: "bad",
      dotTone: "bad",
      pulse: false,
      label: "overview.systemOffline",
      detail: "overview.apiUnreachable",
    };
  }
  if (isDegraded) {
    return {
      tone: "warn",
      dotTone: "wait",
      pulse: false,
      label: "overview.systemDegraded",
      detail: "overview.claudeUnavailable",
    };
  }
  return {
    tone: "ok",
    dotTone: "ok",
    pulse: false,
    label: "overview.systemNominal",
    detail: "overview.daemonReady",
  };
}

/** Map one subsystem's health status to a StatusDot tone (M8 per-subsystem HUD). */
export function subsystemDotTone(status: SubsystemHealth["status"]): DotTone {
  return status === "ok" ? "ok" : status === "degraded" ? "wait" : "bad";
}

/** i18n label key per subsystem name — exhaustive over the contract's name union. */
export const SUBSYSTEM_LABEL: Record<SubsystemHealth["name"], MessageKey> = {
  backend: "overview.subsystemBackend",
  vault: "overview.subsystemVault",
  integrations: "overview.subsystemIntegrations",
  scheduler: "overview.subsystemScheduler",
};
