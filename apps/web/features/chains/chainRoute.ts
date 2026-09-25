import type { Chain } from "@zibby/contracts";
import { DEPARTMENTS } from "@zibby/contracts";
import type { ChainRouteStripGate, ChainRouteStripStep } from "@zibby/design-system";

function departmentCode(id: string): string {
  return DEPARTMENTS.find((d) => d.id === id)?.code ?? id.toUpperCase();
}

function departmentName(id: string): string {
  return DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
}

/**
 * A chain's full stop sequence for `ChainRouteStrip` — the entry department
 * plus every step's department, in order. `state: "idle"` throughout: this is
 * the STANDING route, not a live run's per-step progress (see
 * `TaskDetailScreen`'s `stepFor` for the live-run variant).
 */
export function chainRouteSteps(chain: Pick<Chain, "entry" | "steps">): ChainRouteStripStep[] {
  const departments = [chain.entry, ...chain.steps.map((s) => s.department)];
  return departments.map((id) => ({
    code: departmentCode(id),
    name: departmentName(id),
    state: "idle",
  }));
}

/** One gate marker per hop — 1:1 with `chain.steps` (each step IS a hop's gate). */
export function chainRouteGates(chain: Pick<Chain, "steps">): ChainRouteStripGate[] {
  return chain.steps.map((s) => ({ mode: s.gate }));
}
