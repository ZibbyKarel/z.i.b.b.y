/** A goal verifier's ruling, reduced to the binary the goal loop consumes. */
export type GoalVerdict = "pass" | "fail";

/** Tag words this parser accepts, and what each one means for a goal. */
const VERDICT_WORDS: Record<string, GoalVerdict> = {
  pass: "pass",
  fail: "fail",
  // A judge agent may reach for the pipeline's vocabulary (`parseStageVerdict`).
  // Neither of those is a pass, so both reduce to "fail" here.
  gap: "fail",
  drift: "fail",
};

/**
 * Extract a `<verdict>pass|fail|gap|drift</verdict>` tag from a goal `claude`
 * verifier's log. Deliberately the same tag grammar as the pipeline's
 * {@link import("../pipelines/stage-verdict").parseStageVerdict} — one convention
 * across the codebase — but mapped onto the goal domain's binary pass/fail, because
 * a goal verdict picks a boolean, not a pipeline back-edge.
 *
 * Case-insensitive and whitespace-tolerant. Uses the **LAST** tag, which is
 * load-bearing: `AgentRunnerService.readLog()` returns the whole log including any
 * echoed prompt, so an early tag may be the instruction rather than the ruling.
 *
 * Returns `null` when no valid tag is present. The caller owns the fail-closed
 * default — see `GoalRunnerService.runVerifier`.
 */
export function parseGoalVerdict(text: string): GoalVerdict | null {
  const re = /<verdict>\s*([a-z]+)\s*<\/verdict>/gi;
  let last: GoalVerdict | null = null;
  for (const m of text.matchAll(re)) {
    const word = m[1]!.toLowerCase();
    const mapped = VERDICT_WORDS[word];
    if (mapped) last = mapped;
  }
  return last;
}
