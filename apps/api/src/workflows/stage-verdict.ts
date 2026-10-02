import { type StageVerdict, StageVerdictSchema } from "@zibby/contracts";

/**
 * Extract a `<verdict>pass|gap|drift</verdict>` tag from a qualify phase's produced
 * artifact. Case-insensitive, whitespace-tolerant, uses the LAST tag (an agent may
 * quote the instruction earlier in its write-up). Returns null when no valid tag is
 * present — the caller decides the fail-closed default.
 */
export function parseStageVerdict(text: string): StageVerdict | null {
  const re = /<verdict>\s*(pass|gap|drift)\s*<\/verdict>/gi;
  let last: string | null = null;
  for (const m of text.matchAll(re)) last = m[1]!.toLowerCase();
  const parsed = StageVerdictSchema.safeParse(last);
  return parsed.success ? parsed.data : null;
}
