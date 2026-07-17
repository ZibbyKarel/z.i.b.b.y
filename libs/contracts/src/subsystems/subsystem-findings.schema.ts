import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * NS2 F5a — one persisted fingerprint set per scan key (`"sentinel"`,
 * `"loom"`…). {@link apps/api/src/subsystems/subsystem-findings.store.ts}
 * diffs a fresh scan's fingerprints against the last-written set so a chair's
 * "silent no-op on an unchanged/green run" charter case is a one-line
 * set-equality check rather than re-deriving state from the vault note (the
 * note is a human proposal surface; this snapshot is the machine cursor).
 *
 * Internal — persisted to disk (`SUBSYSTEM_FINDINGS_DIR/<key>.json`) but never
 * exposed over HTTP, so it carries no contract endpoint.
 */
export const FindingSnapshotSchema = z.object({
  key: z.string().min(1),
  /** Stable per-finding ids, sorted. */
  fingerprints: z.array(z.string()),
  updatedAt: IsoDateTimeSchema,
});
export type FindingSnapshot = z.infer<typeof FindingSnapshotSchema>;
