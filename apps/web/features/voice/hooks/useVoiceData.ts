"use client";

import { useApprovalsQuery } from "../../approvals/queries";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import { useCatalog } from "../../../state/store";

/**
 * The live HUD data the voice overlay's four ambient panels feed on: pending
 * approvals, currently running agents, the three most recent runs and the
 * quick-action skills. Pure orchestration over the existing queries — the
 * screen stays a render-only component.
 */
export function useVoiceData() {
  const { data: approvals = [] } = useApprovalsQuery();
  const { runs } = useRunsQuery();
  const { skills } = useCatalog();

  const liveRuns = runs.filter((r) => r.status === "running");
  const recent = [...runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 3);

  return { approvals, liveRuns, recent, skills };
}
