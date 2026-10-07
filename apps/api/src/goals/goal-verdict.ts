/** A goal verifier's ruling, reduced to the binary the goal loop consumes. */
export type GoalVerdict = "pass" | "fail";

/** Tag words this parser accepts, and what each one means for a goal. */
const VERDICT_WORDS: Record<string, GoalVerdict> = {
  pass: "pass",
  fail: "fail",
  // A judge agent may reach for the workflow's vocabulary (`parseStageVerdict`).
  // Neither of those is a pass, so both reduce to "fail" here.
  gap: "fail",
  drift: "fail",
};

/**
 * Extract a `<verdict>pass|fail|gap|drift</verdict>` tag from a goal `claude`
 * verifier's log. Deliberately the same tag grammar as the workflow's
 * {@link import("../workflows/stage-verdict").parseStageVerdict} — one convention
 * across the codebase — but mapped onto the goal domain's binary pass/fail, because
 * a goal verdict picks a boolean, not a workflow back-edge.
 *
 * Case-insensitive and whitespace-tolerant. Uses the **literal LAST** tag: the final
 * `<verdict>…</verdict>` in the text determines the verdict, and an unrecognised word
 * in that final tag means `null` (fail-closed), not a fallback to an earlier tag.
 * This is load-bearing because `AgentRunnerService.readLog()` returns the whole log
 * including any echoed prompt, so an early tag may be the instruction rather than
 * the ruling.
 *
 * Returns `null` when there is no tag at all, or when the last tag's word is not
 * recognized. The caller owns the fail-closed default — see `GoalRunnerService.runVerifier`.
 */
export function parseGoalVerdict(text: string): GoalVerdict | null {
  const re = /<verdict>\s*([a-z]+)\s*<\/verdict>/gi;
  let lastWord: string | null = null;
  for (const m of text.matchAll(re)) {
    lastWord = m[1]!.toLowerCase();
  }
  // No tags at all
  if (lastWord === null) return null;
  // Map the last word; unrecognised words yield null (fail-closed)
  const verdict = VERDICT_WORDS[lastWord];
  return verdict ?? null;
}
