"use client";

import { DEPARTMENTS, type GateRuleInput } from "@zibby/contracts";
import {
  AgentGlyph,
  Breadcrumb,
  Button,
  Container,
  DataTable,
  Panel,
  SelectField,
  Stack,
  StatePill,
  Tag,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import type { StateTone, SubNavLinkComponent } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { useAgentQuery } from "../../agents";
import { useEmployeeQuery, useUpdateEmployeeMutation } from "../../employees";
import { PinButton } from "../../pins";
import { RunLogStream } from "../../runs/components/RunLogStream";
import { useRunsQuery, useStopTaskRunMutation, useTaskRunQuery } from "../../runs";
import { AgentRulesSection } from "../../agents/components/AgentRulesSection";

const STATE_TONE: Record<string, StateTone> = {
  working: "working",
  thinking: "thinking",
  blocked: "blocked",
  error: "error",
  done: "done",
  idle: "idle",
};

export interface PersonProfileScreenProps {
  employeeId: string;
}

export function PersonProfileScreen({ employeeId }: PersonProfileScreenProps) {
  const employeeQuery = useEmployeeQuery(employeeId);
  if (employeeQuery.isError) return <QueryError onRetry={() => void employeeQuery.refetch()} />;
  if (employeeQuery.isPending || !employeeQuery.data) return <QueryLoading />;
  return <Profile employee={employeeQuery.data} employeeId={employeeId} key={employeeId} />;
}

function Profile({
  employee,
  employeeId,
}: {
  employee: NonNullable<ReturnType<typeof useEmployeeQuery>["data"]>;
  employeeId: string;
}) {
  const t = useTranslations("people");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: agent } = useAgentQuery(employee.agentId);
  const updateEmployee = useUpdateEmployeeMutation();
  const stopRun = useStopTaskRunMutation();
  const { runs } = useRunsQuery();
  const currentRunQuery = useTaskRunQuery(employee.currentRunId ?? null);

  const [name, setName] = useState(employee.name);
  const [department, setDepartment] = useState(employee.department);
  const dirty = name.trim() !== employee.name || department !== employee.department;

  const department_ = DEPARTMENTS.find((d) => d.id === employee.department);
  const history = runs.filter((r) => r.owner === employee.agentId).slice(0, 10);
  const tone = STATE_TONE[employee.state] ?? "idle";

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Breadcrumb
            items={[
              { label: t("breadcrumbPeople"), href: "/org/people" },
              { label: employee.name },
            ]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="200" justify="between">
            <Stack align="center" direction="row" gap="200">
              <AgentGlyph seed={employee.agentId} size={128} state={tone} />
              <Stack gap="75">
                <Typography type="title">{employee.name}</Typography>
                <StatePill label={t(`state.${employee.state}`)} state={tone} />
                <Link href={`/org/departments/${employee.department}/team`}>
                  <Typography type="note" variant="secondary">
                    {department_?.name ?? employee.department}
                  </Typography>
                </Link>
                <Typography size="sm" type="note" variant="tertiary">
                  {employee.position.title ?? employee.position.name}
                </Typography>
              </Stack>
            </Stack>
            <Stack direction="row" gap="100">
              <PinButton id={employee.id} kind="employee" />
              {employee.currentRunId && (
                <Button
                  icon="x"
                  intent="danger"
                  loading={stopRun.isPending}
                  onClick={() =>
                    stopRun.mutate({ params: { runId: employee.currentRunId! }, body: {} })
                  }
                  size="sm"
                >
                  {t("stopRun")}
                </Button>
              )}
            </Stack>
          </Stack>

          {employee.currentRunId && (
            <Panel header={t("currentSubtask")}>
              <Container padding="200">
                <Typography type="note">
                  {employee.currentTaskTitle ??
                    currentRunQuery.data?.title ??
                    employee.currentRunId}
                </Typography>
              </Container>
            </Panel>
          )}

          {employee.currentRunId ? (
            <RunLogStream
              key={employee.currentRunId}
              linesLabel={(n) => t("logLines", { count: n })}
              live={employee.state === "working"}
              liveLabel={t("logLive")}
              logLabel={t("logIdle")}
              runId={employee.currentRunId}
            />
          ) : (
            <Panel header={t("logIdle")}>
              <Container padding="200">
                <Typography type="note" variant="tertiary">
                  {t("noActiveRun")}
                </Typography>
              </Container>
            </Panel>
          )}

          <Panel
            header={t("config")}
            headerEnd={
              <Button
                disabled={!dirty || updateEmployee.isPending}
                icon="check"
                intent="primary"
                loading={updateEmployee.isPending}
                onClick={() =>
                  updateEmployee.mutate({
                    params: { id: employeeId },
                    body: {
                      ...(name.trim() !== employee.name ? { name: name.trim() } : {}),
                      ...(department !== employee.department ? { department } : {}),
                    },
                  })
                }
                size="sm"
              >
                {tc("save")}
              </Button>
            }
          >
            <Container padding="200">
              <Stack gap="150">
                <TextInputField
                  label={t("nameLabel")}
                  onChange={(e) => setName(e.target.value)}
                  value={name}
                />
                <SelectField
                  label={t("departmentLabel")}
                  onValueChange={(v) => setDepartment(v as typeof department)}
                  options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))}
                  value={department}
                />
                <Button
                  icon="bot"
                  intent="ghost"
                  onClick={() => router.push(`/system/registries/positions/${employee.agentId}`)}
                >
                  {t("positionLink", { name: employee.position.name })}
                </Button>
              </Stack>
            </Container>
          </Panel>

          {agent && (
            <Panel header={t("rules")}>
              <Container padding="200">
                <AgentRulesSection
                  agentName={agent.name ?? agent.id}
                  gateRuleIds={agent.gateRuleIds ?? []}
                  gates={(agent.gates ?? []) as GateRuleInput[]}
                  onAddRule={() => router.push(`/system/registries/positions/${agent.id}`)}
                  onDeleteRule={() => router.push(`/system/registries/positions/${agent.id}`)}
                  onEditRule={() => router.push(`/system/registries/positions/${agent.id}`)}
                  onLinkedChange={() => router.push(`/system/registries/positions/${agent.id}`)}
                />
              </Container>
            </Panel>
          )}

          <Panel header={t("history")}>
            <DataTable
              columns={[
                { key: "runId", label: t("historyRun"), width: "lg" },
                {
                  key: "status",
                  label: t("historyState"),
                  width: "sm",
                  render: (r) => <Tag>{r.status}</Tag>,
                },
                { key: "startedAt", label: t("historyStarted"), width: "md" },
              ]}
              empty={t("historyEmpty")}
              getRowKey={(r) => r.runId}
              rows={history}
            />
          </Panel>
        </Stack>
      </PageContainer>
    </Container>
  );
}
