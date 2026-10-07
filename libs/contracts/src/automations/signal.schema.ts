import { z } from "zod";
import { DepartmentIdSchema } from "../departments/department.schema";

/**
 * A small ordered severity ladder. Only severity-bearing producers (today:
 * Security's CVE findings) set {@link SignalSchema.severity}; a signal without a
 * severity never fails an automation's `minSeverity` gate.
 */
export const SignalSeveritySchema = z.enum(["low", "moderate", "high", "critical"]);
export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

/** Rank order of the severity ladder (index = position, low → critical). */
export const SIGNAL_SEVERITY_ORDER: readonly SignalSeverity[] = [
  "low",
  "moderate",
  "high",
  "critical",
] as const;

/**
 * The normalized thing a producer department emits onto the signal bus. A signal
 * triggers every enabled automation whose `signal` trigger matches it; the
 * automation is dispatched at most once per `(automation, fingerprint)`.
 */
export const SignalSchema = z.object({
  from: DepartmentIdSchema,
  kind: z.string().min(1),
  severity: SignalSeveritySchema.optional(),
  projectId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  /** The producer's own dedupe key — the same finding never fires an automation twice. */
  fingerprint: z.string().min(1),
});
export type Signal = z.infer<typeof SignalSchema>;

/** The signal kinds the system emits today — the picker for a `signal` trigger. */
export const SIGNAL_KINDS = [
  { id: "cve", label: "Critical dependency vulnerability (Security)" },
  { id: "secret", label: "Leaked secret found (Security)" },
  { id: "post-merge-red", label: "Post-merge CI went red (Release)" },
  { id: "audit-batch", label: "New architecture audit findings (Arch)" },
  { id: "research-artifact", label: "Research artifact delivered (R&D)" },
  { id: "qa-findings", label: "QA findings delivered (QA)" },
] as const;
