import type { DotTone } from "@zibby/design-system";
import type { IntegrationStatus } from "../../domain";

/**
 * Display mapping for an integration's connection status — the single source
 * for how a status renders (dot tone, chip tone, catalog label key), mirroring
 * `RUN_STATE` in features/runs and `riskMeta` in features/approvals.
 */
export const INTEGRATION_STATUS = {
  connected: { dot: "ok", pill: "ok", labelKey: "statusConnected" },
  disconnected: { dot: "faint", pill: "neutral", labelKey: "statusDisconnected" },
  error: { dot: "bad", pill: "bad", labelKey: "statusError" },
} as const satisfies Record<
  IntegrationStatus,
  { dot: DotTone; pill: "ok" | "neutral" | "bad"; labelKey: string }
>;
