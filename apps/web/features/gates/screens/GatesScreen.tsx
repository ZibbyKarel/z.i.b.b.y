"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { DepartmentId } from "@zibby/contracts";
import {
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  SegmentedControl,
  Stack,
  SubNav,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useAgentsQuery } from "../../agents";
import { useDepartmentsQuery } from "../../departments/queries";
import { HandoffRulesSection } from "../../handoff/components/HandoffRulesSection";
import { useHandoffRulesQuery } from "../../handoff";
import { MandateSection } from "../../settings/components/MandateSection";
import { SignalsScreen } from "../../signals/components/SignalsScreen";
import { useProjectsQuery } from "../../projects";
import { GateRulesSection } from "../components/GateRulesSection";
import { SystemFloorPanel } from "../components/SystemFloorPanel";

const SECTIONS = ["floor", "global", "project", "agent", "handoff", "signals", "mandate"] as const;
type Section = (typeof SECTIONS)[number];

function asSection(value: string | null): Section {
  return (SECTIONS as readonly string[]).includes(value ?? "") ? (value as Section) : "floor";
}

function NavLink({
  href,
  ...rest
}: { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href as Route} {...rest} />;
}

interface AgentRuleRow {
  id: string;
  name: string;
  ruleCount: number;
}

/**
 * `/policy/gates` — the gate-rule surfaces unified behind a `?section=` SubNav
 * (ZB-08): floor, global rules, per-project, per-agent (links out), handoff
 * (department mad-libs editor, chains excluded by the existing
 * `includeChains=false` default), signals (ex-`/signals`, moved) and mandate
 * (ex-settings `MandateSection`, moved).
 */
export function GatesScreen() {
  const t = useTranslations("policy.gates");
  const searchParams = useSearchParams();
  const section = asSection(searchParams.get("section"));

  const items = SECTIONS.map((id) => ({
    href: `/policy/gates?section=${id}`,
    label: t(`sections.${id}`),
    active: id === section,
  }));

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("title")}
          </Typography>
        </Stack>

        <SubNav items={items} linkComponent={NavLink} />

        <SectionBody section={section} />
      </Stack>
    </Container>
  );
}

function SectionBody({ section }: { section: Section }): ReactNode {
  if (section === "floor") return <SystemFloorPanel surface="glass" />;
  if (section === "global") return <GateRulesSection hideFloor surface="glass" />;
  if (section === "project") return <ProjectRulesSection />;
  if (section === "agent") return <AgentRulesList />;
  if (section === "handoff") return <HandoffSection />;
  if (section === "signals") return <SignalsScreen />;
  if (section === "mandate") return <MandateSection />;
  return null;
}

/** Gate rules aren't project-scoped in today's data model (only `department`
 *  is) — the picker is kept (per the spec) as navigation into the same global
 *  catalog, filtered client-side by nothing until a `projectId` field exists. */
function ProjectRulesSection() {
  const t = useTranslations("policy.gates");
  const { data: projects = [] } = useProjectsQuery();
  const [selected, setSelected] = useProjectPickerState();

  return (
    <Stack gap="200">
      <SegmentedControl
        ariaLabel={t("projectPicker")}
        items={[
          { value: "", label: t("allProjects") },
          ...projects.map((p) => ({ value: p.id, label: p.name.toUpperCase() })),
        ]}
        onChange={setSelected}
        value={selected}
      />
      <EmptyState body={t("projectRulesEmpty")} title={t("projectPicker")} />
    </Stack>
  );
}

function useProjectPickerState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("project") ?? "";
  const set = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("project", next);
    else params.delete("project");
    router.replace(`/policy/gates?${params.toString()}` as Route);
  };
  return [value, set] as const;
}

function AgentRulesList() {
  const t = useTranslations("policy.gates");
  const { data: agents = [] } = useAgentsQuery();
  const rows: AgentRuleRow[] = agents.map((a) => ({
    id: a.id,
    name: a.name ?? a.id,
    ruleCount: a.gateRuleIds?.length ?? 0,
  }));

  const columns: DataTableColumn<AgentRuleRow>[] = [
    { key: "name", label: t("sections.agent"), width: "flex" },
    {
      key: "ruleCount",
      label: t("agentRuleCount", { count: 0 }),
      width: "sm",
      render: (r) => r.ruleCount,
    },
  ];

  return (
    <DataTable
      columns={columns}
      empty="—"
      getRowKey={(r) => r.id}
      rowHref={(r) => `/org/people/${r.id}`}
      rows={rows}
    />
  );
}

function HandoffSection() {
  const t = useTranslations("policy.gates");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: departments = [] } = useDepartmentsQuery();
  const { data: rules = [] } = useHandoffRulesQuery();

  const departmentId = (searchParams.get("department") ?? departments[0]?.id ?? "") as DepartmentId;
  const department = departments.find((d) => d.id === departmentId);

  const setDepartment = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("department", next);
    router.replace(`/policy/gates?${params.toString()}` as Route);
  };

  if (!department) return <EmptyState body="—" title={t("sections.handoff")} />;

  const outgoing = rules.filter((r) => r.from === departmentId);

  return (
    <Stack gap="200">
      <SegmentedControl
        ariaLabel={t("departmentFilter")}
        items={departments.map((d) => ({ value: d.id, label: d.code.toUpperCase() }))}
        onChange={setDepartment}
        value={departmentId}
      />
      <HandoffRulesSection
        departmentName={department.name}
        fromDepartmentId={departmentId}
        rules={outgoing}
      />
    </Stack>
  );
}
