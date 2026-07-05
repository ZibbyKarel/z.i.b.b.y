/**
 * Lowercase, strip punctuation to spaces, collapse whitespace, cap length — the
 * grouping key used to tally recurring free-text summaries (task-created gaps,
 * Phase 4a's orchestrator-fallback telemetry). Deliberately coarse: it is a
 * dedupe/grouping key, not a display string.
 */
export function normalizeSummary(summary: string, maxLen = 80): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
