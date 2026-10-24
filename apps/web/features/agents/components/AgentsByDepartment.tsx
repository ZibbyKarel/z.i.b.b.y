"use client";

import { EmptyState, Grid, SectionLabel, Stack } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { registryHref } from "../../registries/registryKinds";
import { useAgentsQuery } from "../queries";
import { AgentCard } from "./AgentCard";
import { groupAgentsByDepartment } from "./groupAgentsByDepartment";

export enum AgentsByDepartmentTestId {
  /** Suffixed with the department id, or `none` for the trailing section. */
  Section = "agents-by-department-section",
  Empty = "agents-by-department-empty",
}

/**
 * The Agents page body: one section per department that has agents (department list
 * order), each a grid of glyph {@link AgentCard}s; agents with no/unknown department
 * trail in a "No department" section. A card click opens the agent's detail page.
 */
export function AgentsByDepartment() {
  const t = useTranslations("agents");
  const tr = useTranslations("registries");
  const locale = useLocale();
  const router = useRouter();
  const departments = useDepartmentLookup();
  const query = useAgentsQuery();

  if (query.isPending) return <QueryLoading />;
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;

  const sections = groupAgentsByDepartment(query.data ?? [], [...departments.list], locale);
  if (sections.length === 0) {
    return <EmptyState data-testid={AgentsByDepartmentTestId.Empty} title={tr("emptyAgents")} />;
  }

  return (
    <Stack gap="300">
      {sections.map(({ departmentId, agents }) => {
        const department = departmentId ? departments.get(departmentId) : undefined;
        const heading = department
          ? `${department.name} · ${department.code} · ${agents.length}`
          : `${t("noDepartment")} · ${agents.length}`;
        return (
          <Stack
            data-testid={`${AgentsByDepartmentTestId.Section}-${departmentId ?? "none"}`}
            gap="150"
            key={departmentId ?? "none"}
          >
            <SectionLabel>{heading}</SectionLabel>
            <Grid cols={1} gap="150" lg={3} md={2}>
              {agents.map((agent) => (
                <AgentCard
                  agent={agent}
                  key={agent.id}
                  onClick={(a) => router.push(registryHref("agents", a.id) as Route)}
                />
              ))}
            </Grid>
          </Stack>
        );
      })}
    </Stack>
  );
}
