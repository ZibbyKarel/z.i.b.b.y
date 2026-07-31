/**
 * The ceiling is on rounds ALREADY RUN, checked after the round has produced its
 * result: `decideNext` sees `rounds.length` including the round just finished,
 * so round MAX_ROUNDS runs fully, writes its artifacts, and only then parks. A
 * driver therefore sees at most MAX_ROUNDS - 1 `POKRAČUJ` rounds. Anything
 * rendered or documented about the ceiling has to say that — it is not a refusal
 * to run the last round.
 */
export const MAX_ROUNDS = 5;
export const DONE_PERCENT = 0.5;
export const MAX_REGION_SIDE = 4;
export const MIN_RELATIVE_DROP = 0.2;
export const MAX_SKELETON_FAILURES = 2;

/**
 * One round's verdict. The ordering is the whole point: a failed skeleton gate
 * short-circuits before values and before pixels, because tuning numbers on the
 * wrong structure is wasted work.
 */
export function evaluateRound({ skeleton, values, pixels }) {
  if (!skeleton.pass) {
    const first = skeleton.findings[0];
    return {
      status: "continue",
      reason: `skeleton gate neprošel: ${first ? first.message : "neznámý rozdíl"}`,
    };
  }
  if (values && values.length > 0) {
    return {
      status: "continue",
      reason: `${values.length} hodnotových delt, první: ${values[0].message}`,
    };
  }
  if (!pixels) {
    return { status: "continue", reason: "chybí pixel verdikt" };
  }
  const tooBig =
    pixels.largestRegion.w > MAX_REGION_SIDE || pixels.largestRegion.h > MAX_REGION_SIDE;
  if (pixels.percent < DONE_PERCENT && !tooBig) {
    return {
      status: "done",
      reason: `diff ${pixels.percent} %, největší region ${pixels.largestRegion.w}×${pixels.largestRegion.h}`,
    };
  }
  if (tooBig) {
    return {
      status: "continue",
      reason: `souvislý odlišný region ${pixels.largestRegion.w}×${pixels.largestRegion.h} px překračuje ${MAX_REGION_SIDE}×${MAX_REGION_SIDE}`,
    };
  }
  return { status: "continue", reason: `diff ${pixels.percent} % nad prahem ${DONE_PERCENT} %` };
}

/**
 * `_history` is part of the published signature (kept for callers that may want
 * per-round RoundVerdicts later) but this function only ever needs the compact
 * RoundRecord projection to decide whether to keep going.
 */
export function decideNext(_history, rounds) {
  // Counts skeleton failures anywhere in the run, not just consecutively: two
  // structural failures is evidence the component choice itself is wrong,
  // regardless of whether a passing round sat between them.
  const skeletonFailures = rounds.filter((r) => !r.skeletonPass).length;
  if (skeletonFailures >= MAX_SKELETON_FAILURES) {
    return {
      stop: true,
      reason: `skeleton gate neprošel ${skeletonFailures}× — jde o volbu komponenty, ne o hodnoty; další kola by ladila čísla na špatném základu`,
    };
  }
  if (rounds.length >= MAX_ROUNDS) {
    return { stop: true, reason: `strop ${MAX_ROUNDS} kol vyčerpán` };
  }
  const [previous, current] = rounds.slice(-2);
  if (
    previous &&
    current &&
    previous.percent !== null &&
    current.percent !== null &&
    previous.percent > 0
  ) {
    const drop = (previous.percent - current.percent) / previous.percent;
    if (drop < MIN_RELATIVE_DROP) {
      return {
        stop: true,
        reason: `thrash — pokles jen ${Math.round(drop * 100)} %, práh je ${MIN_RELATIVE_DROP * 100} %`,
      };
    }
  }
  return { stop: false, reason: "pokračuje" };
}

/**
 * One exit code cannot express four outcomes, so the driving agent gets four —
 * looked up here from a single table so the exit code, the console label and
 * `report.md`'s headline can never drift apart as separately maintained copies
 * of the same branch:
 *   0 — done: a match was found, stop calling compare.
 *   1 — continue: no match yet, but the loop has not given up — run compare again.
 *   2 — parked: decideNext stopped the loop (thrash, skeleton gate, round ceiling)
 *       without ever reaching done — stop calling compare and escalate to a human.
 *   3 — error: compare (or measure) itself failed — a bad invocation, a missing
 *       spec.json, a browser that wouldn't launch, a failed write. This must
 *       never collapse into 1 ("continue") — the driving agent has to be able
 *       to tell "make another round" from "the tool itself is broken", or it
 *       loops forever against a dead tool.
 *
 * It lives here rather than in cli.mjs because report.mjs needs it too: D4
 * (task 15) was `renderReport` keeping its own two-state list of headline
 * strings, which printed PARK on every round that was in fact continuing. A
 * second list is exactly what cannot be allowed to exist, and cli.mjs already
 * imports this module, so this is the one place both can reach.
 *
 * `nextStep` is the driver-facing consequence, kept beside the label for the
 * same reason: a report that names the outcome but not what to do with it sends
 * the reader back to the documentation to re-derive the exit-code table.
 */
export const OUTCOME = {
  done: {
    code: 0,
    label: "HOTOVO",
    nextStep: "Shoda nalezena. Přestaň volat `compare`.",
  },
  continue: {
    code: 1,
    label: "POKRAČUJ",
    nextStep:
      "Shoda zatím není, ale smyčka se nevzdala. Uprav implementaci podle `skeleton.md` a `values.md` a spusť `compare` znovu.",
  },
  parked: {
    code: 2,
    label: "PARK",
    nextStep:
      "Smyčka skončila bez shody — další kolo by na tom nic nezměnilo. Přestaň volat `compare` a předej to člověku.",
  },
  error: {
    code: 3,
    label: "CHYBA",
    nextStep: "Běh selhal na chybě nástroje nebo vstupu — viz chybová hláška, ne tento report.",
  },
};

export function classifyVerdict(verdict) {
  if (verdict.status === "error") return "error";
  if (verdict.status === "done") return "done";
  if (verdict.stop) return "parked";
  return "continue";
}

export function selectExitCode(verdict) {
  return OUTCOME[classifyVerdict(verdict)].code;
}

/** Same table as `selectExitCode`, plus the console label and the next step — one home for all three. */
export function describeOutcome(verdict) {
  return OUTCOME[classifyVerdict(verdict)];
}
