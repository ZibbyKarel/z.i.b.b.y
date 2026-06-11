"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Stack, StatusDot, Typography } from "@zibby/design-system";
import type { AgentRun } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useRunningAgentsQuery } from "../queries";
import { useStopAgentRunMutation } from "../mutations";
import { AgentRow } from "./AgentRow";
import { RunLogModal } from "./RunLogModal";

/**
 * The Overview right-rail "running agents" panel. Polls `GET /api/agents/running`
 * and lists each live (or just-finished) run; clicking a row opens its log viewer.
 * Falls back to the original empty stub when nothing is running.
 */
export function RunningAgentsPanel() {
  const t = useTranslations();
  const { data: runs = [] } = useRunningAgentsQuery();
  const stopAgentRun = useStopAgentRunMutation();
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const openRun = openRunId ? (runs.find((r) => r.runId === openRunId) ?? null) : null;

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
              onStop={(r) => stopAgentRun.mutate({ params: { runId: r.runId }, body: {} })}
              run={run}
            />
          ))}
        </Stack>
      )}

      {openRun && (
        <RunLogModal key={openRun.runId} onClose={() => setOpenRunId(null)} run={openRun} />
      )}
    </HudPanel>
  );
}
