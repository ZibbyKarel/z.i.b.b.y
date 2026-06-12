"use client";

import type { AgentRun } from "@zibby/contracts";
import { Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useStopAgentRunMutation } from "../mutations";
import { useRunningAgentsQuery } from "../queries";
import { AgentRow } from "./AgentRow";
import { RunLogModal } from "./RunLogModal";

/**
 * The Overview right-rail "running agents" panel. Polls `GET /api/agents/running`
 * and lists each currently-running run; clicking a row opens its log viewer.
 * The endpoint keeps just-finished runs around for a retention window, so we
 * filter to `status: "running"` here — the panel only ever shows live agents.
 * Falls back to the original empty stub when nothing is running.
 */
export function RunningAgentsPanel() {
  const t = useTranslations();
  const { data: allRuns = [] } = useRunningAgentsQuery();
  const stopAgentRun = useStopAgentRunMutation();
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const runs = allRuns.filter((r) => r.status === "running");

  const openRun = openRunId
    ? (runs.find((r) => r.runId === openRunId) ?? null)
    : null;

  return (
    <HudPanel title={t("overview.runningAgents")}>
      {runs.length === 0 ? (
        <Stack align="center" direction="row" gap="100">
          <StatusDot tone="idle" />
          <Typography mono size="sm" type="note" variant="secondary">
            {t("overview.noAgentsRunning")}
          </Typography>
        </Stack>
      ) : (
        <Stack>
          {runs.map((run: AgentRun, i) => (
            <AgentRow
              divider={i < runs.length - 1}
              key={run.runId}
              onOpen={(r) => setOpenRunId(r.runId)}
              onStop={(r) =>
                stopAgentRun.mutate({ params: { runId: r.runId }, body: {} })
              }
              run={run}
            />
          ))}
        </Stack>
      )}

      {openRun && (
        <RunLogModal
          key={openRun.runId}
          onClose={() => setOpenRunId(null)}
          run={openRun}
        />
      )}
    </HudPanel>
  );
}
