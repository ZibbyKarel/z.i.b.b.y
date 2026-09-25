"use client";

import {
  Breadcrumb,
  Button,
  Card,
  Container,
  DataTable,
  Tabs as DsTabs,
  MetricStrip,
  PipelineStepStrip,
  Stack,
  Tab,
  TabList,
  Typography,
} from "@zibby/design-system";
import type { StateTone, SubNavLinkComponent } from "@zibby/design-system";
import type { DepartmentId } from "@zibby/contracts";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { useChat } from "../../chat";
import { useEmployeesQuery } from "../../employees";
import { HandoffRulesSection } from "../../handoff/components/HandoffRulesSection";
import { useHandoffRulesQuery } from "../../handoff/queries";
import { usePipelinesQuery } from "../../pipelines";
import { useDepartmentQuery, useDepartmentSubtasksQuery } from "../queries";

export const DEPARTMENT_TABS = [
  "team",
  "subtasks",
  "pipelines",
  "handoff",
  "skills",
  "integrations",
  "automations",
  "hooks",
] as const;
export type DepartmentTab = (typeof DEPARTMENT_TABS)[number];

export enum DepartmentScreenTestId {
  ChatButton = "department-screen-chat-button",
}

export interface DepartmentScreenProps {
  departmentId: string;
  tab: DepartmentTab;
}

export function DepartmentScreen({ departmentId, tab }: DepartmentScreenProps) {
  const t = useTranslations("departmentDetail");
  const router = useRouter();
  const { open: openChat } = useChat();
  const departmentQuery = useDepartmentQuery(departmentId);
  const employeesQuery = useEmployeesQuery({
    department: departmentId as DepartmentId,
    status: "active",
  });
  const subtasksQuery = useDepartmentSubtasksQuery(departmentId);
  const pipelinesQuery = usePipelinesQuery();

  if (departmentQuery.isError) return <QueryError onRetry={() => void departmentQuery.refetch()} />;
  if (departmentQuery.isPending || !departmentQuery.data) return <QueryLoading />;

  const department = departmentQuery.data;
  const employees = employeesQuery.data ?? [];
  const subtasks = subtasksQuery.data ?? [];
  const openSubtasks = subtasks.filter((s) => s.state !== "done").length;
  const pipelines = (pipelinesQuery.data ?? []).filter((p) => p.department === departmentId);

  const kpis = [
    { label: t("kpiOpenSubtasks"), value: openSubtasks },
    { label: t("kpiAgents"), value: employees.length },
    { label: t("kpiRunsToday"), value: "—" },
    { label: t("kpiSpendToday"), value: "—" },
  ];

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Breadcrumb
            items={[{ label: t("breadcrumbOrg"), href: "/org" }, { label: department.name }]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack gap="100">
            <Stack align="center" direction="row" gap="150" justify="between">
              <Stack align="center" direction="row" gap="150">
                <Typography mono size="sm" type="note" variant="tertiary">
                  {department.code}
                </Typography>
                <Typography type="title">{department.name}</Typography>
              </Stack>
              {/* O-20: no separate department transcript — the COO dock opens
                  pre-scoped with an explicit department target, which overrides
                  the classifier ("explicit target overrides the classifier"). */}
              <Button
                data-testid={DepartmentScreenTestId.ChatButton}
                icon="bot"
                intent="secondary"
                onClick={() =>
                  openChat({ kind: "department", id: department.id, name: department.name })
                }
                size="sm"
              >
                {t("chatWith", { name: department.code })}
              </Button>
            </Stack>
            <Typography type="note" variant="secondary">
              {department.mandate}
            </Typography>
            <Typography mono size="xs" type="note" variant="tertiary">
              {t("reportsToCoo")}
            </Typography>
          </Stack>

          <MetricStrip columns={4} items={kpis} />

          <Tabs
            onChange={(next) => router.push(`/org/departments/${departmentId}/${next}`)}
            tab={tab}
          />

          {tab === "team" && (
            <TeamTab
              departmentId={departmentId}
              employees={employees}
              loading={employeesQuery.isPending}
            />
          )}
          {tab === "subtasks" && (
            <SubtasksTab loading={subtasksQuery.isPending} subtasks={subtasks} />
          )}
          {tab === "pipelines" && (
            <PipelinesTab departmentId={departmentId} pipelines={pipelines} />
          )}
          {tab === "handoff" && (
            <HandoffTab departmentId={department.id} departmentName={department.name} />
          )}
          {tab === "skills" && <RegistryLinkTab kind="skills" />}
          {tab === "integrations" && <RegistryLinkTab kind="mcp" />}
          {tab === "automations" && <RegistryLinkTab kind="automations" />}
          {tab === "hooks" && <RegistryLinkTab kind="hooks" />}
        </Stack>
      </PageContainer>
    </Container>
  );
}

/** Route-driven top tab row — `value`/`onValueChange` controlled, since the
 * active tab is the `[tab]` route segment, not internal `Tabs` state. */
function Tabs({ tab, onChange }: { tab: DepartmentTab; onChange: (t: DepartmentTab) => void }) {
  const t = useTranslations("departmentDetail");
  return (
    <DsTabs onValueChange={(v) => onChange(v as DepartmentTab)} value={tab}>
      <TabList>
        {DEPARTMENT_TABS.map((key) => (
          <Tab key={key} value={key}>
            {t(`tabs.${key}`)}
          </Tab>
        ))}
      </TabList>
    </DsTabs>
  );
}

function TeamTab({
  departmentId,
  employees,
  loading,
}: {
  departmentId: string;
  employees: ReturnType<typeof useEmployeesQuery>["data"];
  loading: boolean;
}) {
  const t = useTranslations("departmentDetail");
  const list = employees ?? [];
  return (
    <Stack gap="200">
      <Stack direction="row" justify="between">
        <Typography type="labelSm">{t("team.title")}</Typography>
        <Link href={`/org/people/new?department=${departmentId}`}>
          <Button icon="plus" intent="primary" size="sm">
            {t("team.hire")}
          </Button>
        </Link>
      </Stack>
      {loading ? (
        <QueryLoading />
      ) : list.length === 0 ? (
        <EmptyState
          description={t("team.emptyDescription")}
          glyph="bot"
          title={t("team.emptyTitle")}
        />
      ) : (
        <DataTable
          columns={[
            { key: "name", label: t("team.colName"), width: "lg" },
            {
              key: "position",
              label: t("team.colPosition"),
              width: "lg",
              render: (e) => e.position.title ?? e.position.name,
            },
            {
              key: "state",
              label: t("team.colState"),
              width: "sm",
              render: (e) => t(`state.${e.state}`),
            },
          ]}
          getRowKey={(e) => e.id}
          rowHref={(e) => `/org/people/${e.id}`}
          rows={list}
        />
      )}
    </Stack>
  );
}

function SubtasksTab({
  subtasks,
  loading,
}: {
  subtasks: ReturnType<typeof useDepartmentSubtasksQuery>["data"];
  loading: boolean;
}) {
  const t = useTranslations("departmentDetail");
  const list = subtasks ?? [];
  if (loading) return <QueryLoading />;
  if (list.length === 0) {
    return (
      <EmptyState
        description={t("subtasks.emptyDescription")}
        glyph="flow"
        title={t("subtasks.emptyTitle")}
      />
    );
  }
  return (
    <DataTable
      columns={[
        { key: "taskId", label: t("subtasks.colTask"), width: "xl" },
        { key: "step", label: t("subtasks.colStep"), width: "xs" },
        {
          key: "state",
          label: t("subtasks.colState"),
          width: "sm",
          render: (s) => t(`state.${s.state}`),
        },
      ]}
      getRowKey={(s) => `${s.taskId}-${s.step ?? 0}`}
      rows={list}
    />
  );
}

function PipelinesTab({
  departmentId,
  pipelines,
}: {
  departmentId: string;
  pipelines: ReturnType<typeof usePipelinesQuery>["data"];
}) {
  const t = useTranslations("departmentDetail");
  const list = pipelines ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        description={t("pipelines.emptyDescription")}
        glyph="flow"
        title={t("pipelines.emptyTitle")}
      />
    );
  }
  return (
    <Stack gap="150">
      {list.map((p) => (
        <Link href={`/org/departments/${departmentId}/pipelines/${p.id}`} key={p.id}>
          <Card interactive radius="sm">
            <Container padding="200">
              <Stack gap="100">
                <Typography type="labelSm">{p.name}</Typography>
                <PipelineStepStrip
                  phases={p.phases.map((ph) => ({
                    label: ph.agent ?? ph.id ?? "?",
                    state: "idle" as StateTone,
                  }))}
                />
              </Stack>
            </Container>
          </Card>
        </Link>
      ))}
    </Stack>
  );
}

function HandoffTab({
  departmentId,
  departmentName,
}: {
  departmentId: DepartmentId;
  departmentName: string;
}) {
  const t = useTranslations("departmentDetail");
  const { data: rules = [] } = useHandoffRulesQuery();
  const outgoing = rules.filter((r) => r.from === departmentId);
  return (
    <Stack gap="200">
      <HandoffRulesSection
        departmentName={departmentName}
        fromDepartmentId={departmentId}
        rules={outgoing}
      />
      <Link href={`/policy/gates?section=handoff&department=${departmentId}` as Route}>
        <Button icon="link" intent="ghost" size="sm">
          {t("handoff.manageLink")}
        </Button>
      </Link>
    </Stack>
  );
}

/** ZB-11: a link out to the global registry (skills/mcp/hooks now live at
 * `/system/registries/<kind>`; system automations stay at `/automations` —
 * out of ZB-11's scope) rather than a derived "bound in" list on this tab
 * itself — the derived list now lives ON the registry table (O-09), as a
 * "Bound in" column linking back here. */
function RegistryLinkTab({ kind }: { kind: "skills" | "mcp" | "automations" | "hooks" }) {
  const t = useTranslations("departmentDetail");
  const router = useRouter();
  const REGISTRY_ROUTE: Record<typeof kind, Route> = {
    skills: "/system/registries/skills" as Route,
    mcp: "/system/registries/mcp" as Route,
    hooks: "/system/registries/hooks" as Route,
    automations: "/automations",
  };
  return (
    <EmptyState
      actionLabel={t("registryLink")}
      description={t("registryDescription")}
      glyph="server"
      onAction={() => router.push(REGISTRY_ROUTE[kind])}
      title={t("registryTitle")}
    />
  );
}
