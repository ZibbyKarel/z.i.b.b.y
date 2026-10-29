import type { WorkflowPhase } from "@zibby/contracts";

/**
 * Drop phase `id` from a chain. The next phase inherits its `consumes`; a loop
 * whose `to` named it is dropped (with its `qualify` gate, which needs a loop), a
 * `then` naming it falls back to `"fail"`, a `driftTo` naming it is removed
 * (drift then routes to `to`). Pure — the input is not mutated. The caller
 * re-validates the result (e.g. an output sink may now read a vanished file).
 */
export function removePhase(phases: WorkflowPhase[], id: string): WorkflowPhase[] {
  const at = phases.findIndex((p) => p.id === id);
  if (at < 0) return phases;
  const removed = phases[at];
  return phases
    .filter((p) => p.id !== id)
    .map((p, i) => {
      const next: WorkflowPhase = { ...p };
      if (i === at && removed?.consumes !== undefined) next.consumes = removed.consumes;
      if (!p.loop) return next;
      if (p.loop.to === id) {
        delete next.loop;
        delete next.qualify;
        return next;
      }
      const loop = { ...p.loop };
      if (loop.then === id) loop.then = "fail";
      if (loop.driftTo === id) delete loop.driftTo;
      next.loop = loop;
      return next;
    });
}
