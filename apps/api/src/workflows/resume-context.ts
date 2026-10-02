/** The pieces a resumed/retried phase's resume-context block is assembled from. */
export interface ResumeContextInput {
  /** The current `PROGRESS.md` body (what is done / in progress / next). */
  progressMd?: string;
  /** `git log --oneline <baseRef>..HEAD` on the run branch (the committed checkpoints). */
  checkpointLog?: string;
  /** An operator note (resume-with-note, 2.3) to carry into the retried phase. */
  note?: string;
  /** The failing stage's log tail (loop back-edge, 2.x) — what went wrong last time. */
  failureTail?: string;
}

/**
 * Build the resume-context block (Phase 9.3, decision 10) that prefixes a phase being
 * resumed (limit auto-resume / resume-with-note) or retried (loop back-edge). It tells
 * the agent, in plain terms, that this is a CONTINUATION, not a restart: what is
 * already done and committed, what to continue with, and not to re-implement completed
 * items. PURE; one builder feeds every continuation path.
 *
 * Empty inputs collapse cleanly: a section is omitted when its input is blank, and when
 * NOTHING is present the function returns `""` (never an empty fence) so a fresh first
 * run carries no spurious block.
 */
export function buildResumeContext(input: ResumeContextInput): string {
  const progress = input.progressMd?.trim();
  const log = input.checkpointLog?.trim();
  const note = input.note?.trim();
  const failure = input.failureTail?.trim();

  if (!progress && !log && !note && !failure) return "";

  const lines: string[] = [
    "## Resume context — continuation, not restart",
    "",
    "You are resuming work already in progress. Do NOT re-implement completed items or",
    "re-do committed work — continue from where it left off.",
    "",
  ];

  if (log) {
    lines.push("### Already committed (checkpoints on this branch)", "", "```", log, "```", "");
  }
  if (progress) {
    lines.push("### Progress so far", "", progress.trimEnd(), "");
  }
  if (note) {
    lines.push("### Operator note for this attempt", "", note, "");
  }
  if (failure) {
    lines.push("### What failed last attempt", "", "```", failure, "```", "");
  }

  return lines.join("\n").trimEnd();
}
