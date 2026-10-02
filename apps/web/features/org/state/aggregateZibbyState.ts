import type { StateTone } from "@zibby/design-system";

/** Urgency rank: idle < working < waiting (blocked) < error. `done`/`idle` rank lowest. */
const RANK: Record<StateTone, number> = {
  idle: 0,
  done: 0,
  working: 1,
  thinking: 1,
  blocked: 2,
  error: 3,
};

/**
 * Zibby mirrors the most urgent state among its own and every agent's: it only
 * changes when some agent outranks it (ties keep `own`).
 */
export function aggregateZibbyState(own: StateTone, agentStates: Iterable<StateTone>): StateTone {
  let result = own;
  for (const s of agentStates) if (RANK[s] > RANK[result]) result = s;
  return result;
}
