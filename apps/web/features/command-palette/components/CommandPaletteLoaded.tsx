"use client";

import type { Route } from "next";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  type CommandPaletteGroup,
  type CommandPaletteItem,
} from "@zibby/design-system";
import { useApprovalsQuery, useApproveMutation } from "../../approvals";
import { HIGH_RISK_TYPES } from "../../approvals/approval";
import { useAppearance } from "../../../state/appearance";
import { useDepartmentsQuery } from "../../departments/queries";
import { useEmployeesQuery } from "../../employees/queries";
import { useTaskParentsInfiniteQuery } from "../../tasks/queries";
import { useChainsQuery } from "../../chains/queries";
import { useGoalsQuery } from "../../goals/queries";
import { useCompaniesQuery } from "../../companies/queries";
import { useTeamsQuery } from "../../teams/queries";
import { useProjectsQuery } from "../../projects/queries";
import { usePipelinesQuery } from "../../pipelines/queries";
import { useSkillsQuery } from "../../skills/queries";
import { useMcpServersQuery } from "../../mcp/queries";
import { useHooksQuery } from "../../hooks/queries";
import { useCommandsQuery } from "../../commands/queries";
import { useAutomationsQuery } from "../../automations/queries";
import { useSignalKindsQuery } from "../../handoff/queries";
import { useMemorySearchQuery } from "../../knowledge/queries";
import { buildCommandPaletteIndex } from "../buildIndex";
import { groupAndFilterEntries } from "../filterEntries";
import { useCommandPaletteLabels } from "../hooks/useCommandPaletteLabels";
import type { CommandPaletteEntry } from "../types";

export interface CommandPaletteLoadedProps {
  query: string;
  onQueryChange: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  /** Opens the shared `?approval=` sheet (the same one the "NEEDS YOU" rail
   * uses) — "Approve next" routes a high-risk pick there instead of quick
   * -approving it, never bypassing the approval floor. */
  onOpenApproval: (id: string) => void;
  ariaLabel: string;
  placeholder: string;
  emptyLabel: string;
}

/**
 * Only mounted while the palette is open (see `CommandPaletteHost`) — every
 * hook below is therefore only ever subscribed while `⌘K` is on screen, which
 * is how "queries only fire while the palette is open" is achieved without
 * threading an `enabled` option through hooks that don't already take one.
 */
export function CommandPaletteLoaded({
  query,
  onQueryChange,
  onOpenChange,
  onOpenApproval,
  ariaLabel,
  placeholder,
  emptyLabel,
}: CommandPaletteLoadedProps) {
  const router = useRouter();
  const labels = useCommandPaletteLabels();
  const { theme, setTheme } = useAppearance();

  const { data: departments } = useDepartmentsQuery();
  const { data: employees } = useEmployeesQuery();
  const { data: tasks } = useTaskParentsInfiniteQuery({});
  const { data: chains } = useChainsQuery();
  const { data: goals } = useGoalsQuery();
  const { data: companies } = useCompaniesQuery();
  const { data: teams } = useTeamsQuery();
  const { data: projects } = useProjectsQuery();
  const { data: pipelines } = usePipelinesQuery();
  const { data: skills } = useSkillsQuery();
  const { data: mcpServers } = useMcpServersQuery();
  const { data: hooks } = useHooksQuery();
  const { data: commands } = useCommandsQuery();
  const { data: automations } = useAutomationsQuery();
  const { data: signalKinds } = useSignalKindsQuery();
  const { data: memoryHits, isFetching: memoryLoading } = useMemorySearchQuery(query);
  const { data: approvals } = useApprovalsQuery();
  const approve = useApproveMutation();

  const pendingApprovals = useMemo(() => approvals ?? [], [approvals]);
  const oldestApproval = useMemo(
    () =>
      pendingApprovals.reduce<(typeof pendingApprovals)[number] | undefined>((oldest, a) => {
        if (!oldest) return a;
        return Date.parse(a.requestedAt) < Date.parse(oldest.requestedAt) ? a : oldest;
      }, undefined),
    [pendingApprovals],
  );

  const entries = useMemo<CommandPaletteEntry[]>(
    () =>
      buildCommandPaletteIndex(
        {
          departments: (departments ?? []).map((d) => ({ id: d.id, name: d.name })),
          people: (employees ?? []).map((e) => ({
            id: e.id,
            name: e.name,
            department: e.department,
          })),
          tasks: (tasks ?? []).map((t) => ({ id: t.id, title: t.title, department: t.department })),
          chains: (chains ?? []).map((c) => ({ id: c.id, label: c.label })),
          goals: (goals ?? []).map((g) => ({ id: g.id, name: g.name, objective: g.objective })),
          companies: (companies ?? []).map((c) => ({ id: c.id, name: c.name })),
          teams: (teams ?? []).map((t) => ({ id: t.id, name: t.name })),
          projects: (projects ?? []).map((p) => ({ id: p.id, name: p.name })),
          pipelines: (pipelines ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            department: p.department,
          })),
          skills: (skills ?? []).map((s) => ({ id: s.id, name: s.name })),
          mcpServers: (mcpServers ?? []).map((m) => ({ id: m.id, name: m.name })),
          hooks: (hooks ?? []).map((h) => ({ id: h.id, name: h.name, event: h.event })),
          commands: (commands ?? []).map((c) => ({ id: c.id, description: c.description })),
          automations: (automations ?? []).map((a) => ({ id: a.id, name: a.name })),
          signals: (signalKinds ?? []).map((s) => ({ id: s.id, label: s.label })),
          notes: (memoryHits?.results ?? []).map((hit) => ({
            id: hit.id,
            title: hit.title,
            snippet: hit.snippet,
          })),
          hasPendingApproval: pendingApprovals.length > 0,
        },
        labels,
      ),
    [
      departments,
      employees,
      tasks,
      chains,
      goals,
      companies,
      teams,
      projects,
      pipelines,
      skills,
      mcpServers,
      hooks,
      commands,
      automations,
      signalKinds,
      memoryHits,
      pendingApprovals.length,
      labels,
    ],
  );

  const groups = useMemo<CommandPaletteGroup[]>(() => {
    return groupAndFilterEntries(entries, query).map(({ group, entries: groupEntries }) => ({
      label: labels.group[group],
      items: groupEntries.map(
        (entry): CommandPaletteItem => ({
          id: entry.id,
          kind: labels.kind[entry.kind],
          label: entry.label,
          meta: entry.meta,
          href: entry.href,
          onSelect: () => {
            if (entry.actionId === "new-task") {
              router.push("/work/tasks/new" as Route);
              return;
            }
            if (entry.actionId === "approve-next") {
              if (!oldestApproval) return;
              const highRisk =
                oldestApproval.riskType != null && HIGH_RISK_TYPES.has(oldestApproval.riskType);
              if (highRisk) {
                onOpenApproval(oldestApproval.id);
              } else {
                approve.mutate({ params: { id: oldestApproval.id }, body: {} });
              }
              return;
            }
            if (entry.actionId === "toggle-theme") {
              // A resolved light/dark toggle — `system` collapses to `dark` on
              // the first press, mirroring the common command-palette
              // convention (the full 3-way picker lives in
              // `/system/settings/appearance`).
              setTheme(theme === "light" ? "dark" : "light");
              return;
            }
            if (entry.href) router.push(entry.href);
          },
        }),
      ),
    }));
  }, [entries, query, labels, router, oldestApproval, approve, onOpenApproval, theme, setTheme]);

  return (
    <CommandPalette
      open
      ariaLabel={ariaLabel}
      emptyLabel={emptyLabel}
      groups={groups}
      loading={memoryLoading}
      onOpenChange={onOpenChange}
      onQueryChange={onQueryChange}
      placeholder={placeholder}
      query={query}
    />
  );
}
