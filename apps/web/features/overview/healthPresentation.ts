import type { DotTone } from "@zibby/design-system";
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
