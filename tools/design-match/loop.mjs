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
