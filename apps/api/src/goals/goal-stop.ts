import type { GoalRun } from "@zibby/contracts";

/** The four outcomes of one iteration's stop check. */
export type GoalStopDecision = "satisfied" | "continue" | "park-iterations" | "park-budget";

/**
 * The pure stop-condition matrix for the goal loop (Phase 10.2, decision 4).
 * Precedence: an over-cap budget parks before anything else (the maker can't run);
 * a satisfied verifier finishes; otherwise the maxIterations fuse parks when this
 * was the last allowed attempt; else continue to the next iteration.
 *
 * `index` is 0-based, so `index + 1` is the count of attempts made — the loop has
 * exhausted its budget when that reaches `maxIterations`.
 */
export function decideStop(input: {
  satisfied: boolean;
  index: number;
  maxIterations: number;
  budgetOk: boolean;
}): GoalStopDecision {
  if (!input.budgetOk) return "park-budget";
  if (input.satisfied) return "satisfied";
  if (input.index + 1 >= input.maxIterations) return "park-iterations";
  return "continue";
}

/**
 * A compact human-readable progress block for a goal run — the `progressMd` input
 * to the resume-context builder. Pure: one line per iteration with its verifier
 * verdict, so a continuation maker sees what has been tried.
 */
export function renderGoalProgress(run: GoalRun, objective: string, maxIterations: number): string {
  const lines = [
    `# Goal progress — ${objective}`,
    "",
    `Iteration ${(run.currentIteration ?? run.iterations.length) + 1} of ${maxIterations}.`,
    "",
  ];
  if (run.iterations.length === 0) {
    lines.push("_No iterations completed yet._");
  } else {
    for (const it of run.iterations) {
      const verdict = it.verifier.satisfied ? "verifier satisfied" : "verifier NOT satisfied";
      lines.push(`- Iteration ${it.index + 1}: maker ${it.status}, ${verdict}`);
    }
  }
  return lines.join("\n");
}
