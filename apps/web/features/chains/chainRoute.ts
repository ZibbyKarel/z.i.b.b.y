import type { Chain } from "@zibby/contracts";
import type { ChainRouteStripGate, ChainRouteStripStep } from "@zibby/design-system";
import type { DepartmentLookup } from "../departments/departmentLookup";

/**
 * A chain's full stop sequence for `ChainRouteStrip` — the entry department
 * plus every step's department, in order. `state: "idle"` throughout: this is
 * the STANDING route, not a live run's per-step progress (see
 * `TaskDetailScreen`'s `stepFor` for the live-run variant).
 */
export function chainRouteSteps(
  chain: Pick<Chain, "entry" | "steps">,
  lookup: DepartmentLookup,
): ChainRouteStripStep[] {
  const departments = [chain.entry, ...chain.steps.map((s) => s.department)];
  return departments.map((id) => ({
    code: lookup.code(id),
    name: lookup.name(id),
    state: "idle",
  }));
}

/** One gate marker per hop — 1:1 with `chain.steps` (each step IS a hop's gate). */
export function chainRouteGates(chain: Pick<Chain, "steps">): ChainRouteStripGate[] {
  return chain.steps.map((s) => ({ mode: s.gate }));
}
