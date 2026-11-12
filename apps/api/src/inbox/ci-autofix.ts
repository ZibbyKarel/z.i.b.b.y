/**
 * "Automatická oprava CI mých PRs" — the heartbeat's pure decision for one of the operator's own
 * PRs (docs/api/inbox.md "Automatic CI fix on my PRs"). No I/O: {@link PrAutomationService} feeds
 * it the PR row and the past triage / fix-ci runs of that PR and carries out the step it returns.
 *
 * The loop: red CI settles → `pr-ci-triage` (cheap, read-only) → flaky/infra: re-run the failed
 * jobs (at most {@link CI_AUTOFIX_MAX_RERUNS_PER_HEAD} per head, not a fix attempt) → code /
 * unclear / reruns used up: `pr-fix-ci` (at most {@link CI_AUTOFIX_MAX_FIX_ATTEMPTS} per fix
 * chain) → otherwise park and tell the operator. A fix chain is the current head plus every head
 * ZIBBY's own pushed fixes came from: a commit the operator pushes starts a fresh chain.
 */

export const CI_AUTOFIX_MAX_RERUNS_PER_HEAD = 2;
export const CI_AUTOFIX_MAX_FIX_ATTEMPTS = 2;

/** The PR row fields the decision reads (a subset of `InboxPr`). */
export interface CiAutofixPr {
  bucket: string;
  draft?: boolean;
  headSha?: string;
  ci: string;
  ciSettled?: boolean;
  ciFailingChecks?: readonly string[];
  ciCompletedAt?: string;
}

/** One past `pr-ci-triage` task of the PR (`ScheduledTask.prCiTriage`). */
export interface CiTriageRun {
  taskId: string;
  headSha: string;
  state: string;
  verdict?: string;
  failingChecks: readonly string[];
  ciCompletedAt?: string;
  /** Why a `failed` triage failed (no verdict, or the rerun was rejected). */
  note?: string;
  /** The task died without writing its state back (`isDeadTask`). */
  dead: boolean;
}

/** One past `pr-fix-ci` task of the PR (`ScheduledTask.prFixCi`). */
export interface CiFixRun {
  taskId: string;
  headSha: string;
  state: string;
  fixedSha?: string;
  triageTaskId?: string;
  dead: boolean;
}

export type CiAutofixStep =
  | { kind: "none" }
  | { kind: "triage" }
  | { kind: "rerun"; triageTaskId: string }
  | { kind: "fix"; triageTaskId: string }
  | { kind: "park"; triageTaskId: string; note: string };

const IN_FLIGHT = new Set(["running", "awaiting-approval"]);

const inFlight = (run: { state: string; dead: boolean }): boolean =>
  IN_FLIGHT.has(run.state) && !run.dead;

/** Same CI result: both carry the same completion time, or neither knows it. */
const sameCiResult = (a?: string, b?: string): boolean => (a ?? "") === (b ?? "");

const sameChecks = (a: readonly string[], b: readonly string[]): boolean => {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((name, i) => name === y[i]);
};

/**
 * The heads of the current fix chain: `headSha`, then — while that head is a sha ZIBBY's own
 * pushed fix produced — the head that fix started from, and so on.
 */
export function fixChainHeads(headSha: string, fixes: readonly CiFixRun[]): Set<string> {
  const heads = new Set([headSha]);
  let head = headSha;
  for (;;) {
    const parent = fixes.find((f) => f.state === "pushed" && f.fixedSha === head);
    if (!parent || heads.has(parent.headSha)) return heads;
    heads.add(parent.headSha);
    head = parent.headSha;
  }
}

/** Fix attempts spent on the current chain — every fix run that started from one of its heads. */
export function fixAttempts(headSha: string, fixes: readonly CiFixRun[]): number {
  const heads = fixChainHeads(headSha, fixes);
  return fixes.filter((f) => heads.has(f.headSha)).length;
}

/** Re-runs already spent on this exact head. */
export function rerunsOnHead(headSha: string, triages: readonly CiTriageRun[]): number {
  return triages.filter((t) => t.headSha === headSha && t.state === "rerun").length;
}

/**
 * The next step for one PR. `triages` / `fixes` are this PR's runs only. Never `triage` twice for
 * the same CI result; a red result that a rerun or a fix already answered is re-triaged only once
 * CI has settled again on a newer result.
 */
export function decideCiAutofix(
  pr: CiAutofixPr,
  triages: readonly CiTriageRun[],
  fixes: readonly CiFixRun[],
): CiAutofixStep {
  const head = pr.headSha;
  if (pr.bucket !== "mine" || pr.draft === true || !head) return { kind: "none" };
  // One thing at a time per PR: a triage or fix in flight (incl. a rerun / push approval) waits.
  if (triages.some(inFlight) || fixes.some(inFlight)) return { kind: "none" };
  const red = pr.ci === "failing" && pr.ciSettled === true;
  if (!red) return { kind: "none" };

  const current = triages.filter(
    (t) => t.headSha === head && sameCiResult(t.ciCompletedAt, pr.ciCompletedAt),
  );
  const pending = current.find((t) => t.state === "triaged" || t.state === "failed");
  if (pending) return nextAfterTriage(head, pending, triages, fixes);
  // Any other triage of this CI result (rerun, fix-started, parked, discarded) already answered it.
  if (current.length > 0) return { kind: "none" };
  return { kind: "triage" };
}

function nextAfterTriage(
  head: string,
  triage: CiTriageRun,
  triages: readonly CiTriageRun[],
  fixes: readonly CiFixRun[],
): CiAutofixStep {
  const id = triage.taskId;
  if (triage.state === "failed") {
    return { kind: "park", triageTaskId: id, note: triage.note ?? "triáž CI nedala verdikt" };
  }
  const flaky = triage.verdict === "flaky" || triage.verdict === "infra";
  if (flaky && rerunsOnHead(head, triages) < CI_AUTOFIX_MAX_RERUNS_PER_HEAD) {
    return { kind: "rerun", triageTaskId: id };
  }
  if (fixAttempts(head, fixes) >= CI_AUTOFIX_MAX_FIX_ATTEMPTS) {
    return {
      kind: "park",
      triageTaskId: id,
      note: `vyčerpány ${CI_AUTOFIX_MAX_FIX_ATTEMPTS} pokusy o opravu`,
    };
  }
  // The head is ZIBBY's own fix, and the very checks that fix targeted still fail → stop.
  const ownFix = fixes.find((f) => f.state === "pushed" && f.fixedSha === head);
  const before = ownFix?.triageTaskId
    ? triages.find((t) => t.taskId === ownFix.triageTaskId)
    : undefined;
  if (before && sameChecks(before.failingChecks, triage.failingChecks)) {
    return { kind: "park", triageTaskId: id, note: "po opravě padají stejné checky" };
  }
  return { kind: "fix", triageTaskId: id };
}
