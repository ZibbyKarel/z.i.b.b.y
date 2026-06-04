import { useMemo } from "react";
import type { IconName } from "@zibby/design-system";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import {
  type RunView,
  agentRunToView,
  pipelineRunToView,
  skillRunToView,
} from "../run";

const POLL_MS = 2_000;

/**
 * The unified runs feed. There is no cross-kind list endpoint, so this merges the
 * three per-kind `…/running` lists (skill + agent + pipeline) client-side, newest
 * first. Each underlying query self-gates polling — it keeps refetching while any
 * of its runs is still `running`/`awaiting-approval`, idling otherwise.
 */
export function useRunsQuery(): { runs: RunView[] } {
  const skills = apiClient.skillRuns.listRunningSkills.useQuery({
    queryKey: ["skillRuns", "running"],
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
  const agents = apiClient.agentRuns.listRunning.useQuery({
    queryKey: ["agentRuns", "running"],
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
  const pipelines = apiClient.pipelineRuns.listPipelineRuns.useQuery({
    queryKey: ["pipelineRuns", "list"],
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });

  const runs = useMemo<RunView[]>(() => {
    const merged: RunView[] = [
      ...(skills.data ?? []).map(skillRunToView),
      ...(agents.data ?? []).map(agentRunToView),
      ...(pipelines.data ?? []).map(pipelineRunToView),
    ];
    return merged.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [skills.data, agents.data, pipelines.data]);

  return { runs };
}

/** Build the owner-id → glyph map from the skill/agent catalogs (for run cards). */
export function useRunGlyphMap(): Map<string, IconName> {
  const skills = apiClient.skills.listSkills.useQuery({
    queryKey: ["skills"],
    select: selectApiResponseBody,
  });
  const agents = apiClient.agents.listAgents.useQuery({
    queryKey: ["agents"],
    select: selectApiResponseBody,
  });
  return useMemo(() => {
    const map = new Map<string, IconName>();
    for (const s of skills.data ?? []) if (s.glyph) map.set(s.id, s.glyph as IconName);
    for (const a of agents.data ?? []) if (a.glyph) map.set(a.id, a.glyph as IconName);
    return map;
  }, [skills.data, agents.data]);
}
