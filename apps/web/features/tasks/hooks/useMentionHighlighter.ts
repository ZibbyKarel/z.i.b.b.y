"use client";
import type { HighlightRange } from "@zibby/design-system";
import { useCallback, useMemo } from "react";
import { useAgentsQuery } from "../../agents";
import { useCompaniesQuery } from "../../companies";
import { useDepartmentsQuery } from "../../departments/queries/useDepartmentsQuery";
import { useMarketplaceSkillsQuery } from "../../marketplaces";
import { useProjectsQuery } from "../../projects";
import { useSkillsQuery } from "../../skills";
import { useTeamsQuery } from "../../teams";
import { useWorkflowsQuery } from "../../workflows";
import {
  ALL_TRIGGERS,
  type KnownName,
  mentionRanges,
} from "../components/CommandLine/mentionRanges";

/**
 * `(text) => HighlightRange[]` for READ-ONLY text the composer produced (a sent chat
 * turn, a submitted brief): the very `mentionRanges` the `CommandLine` input runs,
 * over every name the pickers offer (same tones), so a mention looks the same once
 * sent as while typed. Stable while the catalogs are — safe as a `Markdown` prop.
 */
export function useMentionHighlighter(): (text: string) => HighlightRange[] {
  const { data: agents = [] } = useAgentsQuery();
  const { data: departments = [] } = useDepartmentsQuery();
  const { data: workflows = [] } = useWorkflowsQuery();
  const { data: companies = [] } = useCompaniesQuery();
  const { data: teams = [] } = useTeamsQuery();
  const { data: projects = [] } = useProjectsQuery();
  const { data: skills = [] } = useSkillsQuery();
  const { data: marketplaceSkills = [] } = useMarketplaceSkillsQuery();

  const known = useMemo<KnownName[]>(
    () => [
      ...agents.map((a): KnownName => ({ trigger: "@", name: a.name ?? a.id, tone: "accent" })),
      ...departments.map((d): KnownName => ({ trigger: "@", name: d.name, tone: "accent" })),
      ...workflows.map((w): KnownName => ({ trigger: "@", name: w.name, tone: "push" })),
      ...[...companies, ...teams, ...projects].map(
        (s): KnownName => ({ trigger: "#", name: s.name, tone: "push" }),
      ),
      ...[...skills, ...marketplaceSkills].map(
        (s): KnownName => ({ trigger: "/", name: s.name, tone: "accent" }),
      ),
    ],
    [agents, departments, workflows, companies, teams, projects, skills, marketplaceSkills],
  );
  return useCallback((text: string) => mentionRanges(text, known, ALL_TRIGGERS), [known]);
}
