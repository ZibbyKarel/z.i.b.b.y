import type { PipelineRun } from "@zibby/contracts";

/**
 * Render `PROGRESS.md` for a pipeline run (Phase 9.3) — a deterministic, human- and
 * agent-readable snapshot of where the run is: which phases are Done (with the
 * checkpoint sha committed for each), what is In progress, and what is Next. PURE:
 * a function of the aggregate's `stageRuns` + `checkpoints` + `currentStage` plus the
 * pipeline's phase order, so it is snapshot-testable and round-trip stable
 * (render → render is identical for the same inputs).
 *
 * The runner rewrites this file after every phase transition (done / failed / paused /
 * parked) so the file always tells the truth, and a resumed phase's resume-context is
 * assembled from it.
 */
export function renderProgress(run: PipelineRun, phaseIds: readonly string[]): string {
  // The last checkpoint sha committed for each phase (a phase may be re-run on a loop).
  const shaByPhase = new Map<string, string>();
  for (const cp of run.checkpoints ?? []) shaByPhase.set(cp.phaseId, cp.sha);

  // Phases that have reached `done` at least once, in pipeline order (deduped).
  const doneSet = new Set(run.stageRuns.filter((s) => s.status === "done").map((s) => s.phaseId));
  const donePhases = phaseIds.filter((id) => doneSet.has(id));

  const lines: string[] = [`# PROGRESS — ${run.pipelineId}`, "", `Run: ${run.pipelineRunId}`, ""];

  lines.push("## Done");
  if (donePhases.length === 0) {
    lines.push("- _nothing yet_");
  } else {
    for (const id of donePhases) {
      const sha = shaByPhase.get(id);
      lines.push(`- [x] ${id}${sha ? ` (checkpoint ${sha})` : ""}`);
    }
  }
  lines.push("");

  lines.push("## In progress");
  // A finished run (done/failed) has no current stage; a paused/parked/running one does.
  const inProgress = run.currentStage && !doneSet.has(run.currentStage) ? run.currentStage : null;
  lines.push(inProgress ? `- [ ] ${inProgress} (${run.status})` : "- _none_");
  lines.push("");

  lines.push("## Next");
  const cursor = run.currentStage;
  const cursorIdx = cursor ? phaseIds.indexOf(cursor) : -1;
  const next =
    cursorIdx >= 0
      ? phaseIds.slice(cursorIdx + 1)
      : // No current stage: if the run is unfinished, everything not-yet-done is next.
        run.status === "running"
        ? phaseIds.filter((id) => !doneSet.has(id))
        : [];
  if (next.length === 0) {
    lines.push("- _none_");
  } else {
    for (const id of next) lines.push(`- [ ] ${id}`);
  }

  return `${lines.join("\n")}\n`;
}
