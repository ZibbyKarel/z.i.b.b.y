"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Typography } from "@zibby/design-system";
import type { Agent } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { CardGrid } from "../../../components/CardGrid/CardGrid";
import { AgentCard } from "../../agents/components/AgentCard";
import { useAgentsQuery } from "../../agents/queries";
import { useStartAgentRunMutation } from "../../agents/mutations";
import { togglePinnedAgent, usePinnedAgents } from "../../agents/pinnedAgents";
import { usePipelinesQuery } from "../../pipelines/queries";
import { RunModal } from "../../skills/components/RunModal/RunModal";

/**
 * Overview "quick launch" panel: the agents the user has pinned (from the Agents
 * page), surfaced as the very same {@link AgentCard} used in the catalog — pinned
 * state lit, pin toggle unpins straight from here. Launching opens the same
 * {@link RunModal} as the catalog, so a run from here behaves identically.
 * Renders an empty hint when the user has agents but hasn't pinned any yet.
 */
export function QuickLaunchPanel() {
  const t = useTranslations();
  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const pinnedIds = usePinnedAgents();
  const startAgentRun = useStartAgentRunMutation();
  const [runAgent, setRunAgent] = useState<Agent | null>(null);

  // Preserve pin order, and drop ids whose agent was since deleted.
  const byId = new Map(agents.map((a) => [a.id, a]));
  const pinned = pinnedIds.map((id) => byId.get(id)).filter((a): a is Agent => Boolean(a));

  const pipelineCount = (a: Agent) =>
    pipelines.filter((p) => p.phases.some((ph) => ph.agent === a.name)).length;

  return (
    <HudPanel title={t("overview.quickLaunch")}>
      {pinned.length === 0 ? (
        <Typography mono size="sm" type="note" variant="secondary">
          {t("overview.quickLaunchEmpty")}
        </Typography>
      ) : (
        <CardGrid lg={2}>
          {pinned.map((agent) => (
            <AgentCard
              pinned
              agent={agent}
              key={agent.id}
              onOpen={(a) => setRunAgent(a)}
              onRun={(a) => setRunAgent(a)}
              onTogglePin={(a) => togglePinnedAgent(a.id)}
              pipelineCount={pipelineCount(agent)}
            />
          ))}
        </CardGrid>
      )}

      {runAgent && (
        <RunModal
          agent={runAgent}
          key={runAgent.id}
          onClose={() => setRunAgent(null)}
          onLaunch={({ agent, prompt, files }) =>
            startAgentRun.mutate({ params: { id: agent.id }, body: { prompt, project: "", files } })
          }
        />
      )}
    </HudPanel>
  );
}
