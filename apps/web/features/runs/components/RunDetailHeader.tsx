"use client";

import {
  AgentBadge,
  Container,
  Dropdown,
  MetricStrip,
  Pressable,
  Progress,
  Stack,
  StatePill,
  type StateTone,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAgentSymbol } from "../../agents";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useProjectsQuery } from "../../projects";
import { useAssignRunProjectMutation } from "../mutations";
import { type RunView, runTitle } from "../run";
import { MODE_TONE, type RunMetric, type RunMode } from "../runDetailModel";

export enum RunDetailHeaderTestId {
  Root = "run-detail-header",
  Back = "run-detail-back",
  TaskLink = "run-detail-task-link",
  Title = "run-detail-title",
  State = "run-detail-state",
  AgentLink = "run-detail-agent-link",
  ProjectLink = "run-detail-project-link",
  AssignProject = "run-detail-assign-project",
  Progress = "run-detail-progress",
  Metrics = "run-detail-metrics",
}

export interface RunDetailHeaderProps {
  run: RunView;
  mode: RunMode;
  metrics: RunMetric[];
  progressPct: number;
  agent?: { id: string; name: string; role?: string; state: StateTone };
  /** The `RunDetailActions` slot, right of the title block. */
  actions: ReactNode;
  /** Inside a detail sheet: the sheet header already carries breadcrumb and title, metrics fold to 3 columns. */
  compact?: boolean;
}

function Sep() {
  return (
    <Typography as="span" type="labelSm">
      ·
    </Typography>
  );
}

/** Pick a project for a project-less run; renders nothing on an empty registry. */
function AssignProject({ runId }: { runId: string }) {
  const t = useTranslations("runs.detail");
  const { data: projects = [] } = useProjectsQuery();
  const assign = useAssignRunProjectMutation();
  if (projects.length === 0) return null;
  return (
    <Container as="span" data-testid={RunDetailHeaderTestId.AssignProject}>
      <Dropdown
        aria-label={t("assignProject")}
        onChange={(projectId) => {
          if (projectId) assign.mutate({ params: { runId }, body: { projectId } });
        }}
        options={[
          { value: "", label: t("assignProject") },
          ...projects.map((p) => ({ value: p.id, label: p.name })),
        ]}
        size="sm"
        value=""
      />
    </Container>
  );
}

/** Breadcrumb, title, state/agent/department/project meta line, actions, progress hairline, metrics. */
export function RunDetailHeader({
  run,
  mode,
  metrics,
  progressPct,
  agent,
  actions,
  compact,
}: RunDetailHeaderProps) {
  const t = useTranslations("runs");
  const router = useRouter();
  const departments = useDepartmentLookup();
  const symbolOf = useAgentSymbol();
  const { taskId, projectId, department } = run;

  return (
    <Stack data-testid={RunDetailHeaderTestId.Root} gap="0">
      <Container padding={["250", "300", "150", "300"]}>
        <Stack align="start" direction="row" gap="300">
          <Stack grow gap="150">
            {!compact && (
              <Stack wrap align="center" direction="row" gap="100">
                <Pressable
                  data-testid={RunDetailHeaderTestId.Back}
                  onClick={() => router.push("/activity/runs")}
                >
                  <Typography as="span" type="labelSm" variant="secondary">
                    {t("detail.backToRuns")}
                  </Typography>
                </Pressable>
                <Typography as="span" type="labelSm">
                  /
                </Typography>
                <Typography as="span" type="labelSm">
                  {run.runId}
                </Typography>
                <Sep />
                <Typography as="span" type="labelSm">
                  {t(`kind.${run.kind}`).toUpperCase()}
                </Typography>
                {taskId && (
                  <>
                    <Sep />
                    <Pressable
                      data-testid={RunDetailHeaderTestId.TaskLink}
                      onClick={() => router.push(`/work/tasks/${taskId}`)}
                    >
                      <Typography as="span" type="labelSm" variant="secondary">
                        {`${taskId} →`}
                      </Typography>
                    </Pressable>
                  </>
                )}
              </Stack>
            )}
            {!compact && (
              <Typography data-testid={RunDetailHeaderTestId.Title} type="h1">
                {runTitle(run)}
              </Typography>
            )}
            <Stack wrap align="center" direction="row" gap="150">
              <StatePill
                data-testid={RunDetailHeaderTestId.State}
                label={t(`detail.mode.${mode}`)}
                state={MODE_TONE[mode]}
              />
              {agent && (
                <Pressable
                  data-testid={RunDetailHeaderTestId.AgentLink}
                  onClick={() => router.push(`/workforce/agents/${agent.id}`)}
                >
                  <Stack inline align="center" direction="row" gap="75">
                    <AgentBadge {...symbolOf(agent.id)} size="xs" state={agent.state} />
                    <Typography as="span" type="label" variant="primary">
                      {agent.role ? `${agent.name} · ${agent.role}` : agent.name}
                    </Typography>
                  </Stack>
                </Pressable>
              )}
              {department && (
                <>
                  <Sep />
                  <Typography as="span" type="label" variant="secondary">
                    {`${departments.code(department)} · ${departments.name(department)}`}
                  </Typography>
                </>
              )}
              {projectId ? (
                <>
                  <Sep />
                  <Pressable
                    data-testid={RunDetailHeaderTestId.ProjectLink}
                    onClick={() => router.push(`/projects/${projectId}`)}
                  >
                    <Typography as="span" type="label" variant="secondary">
                      {run.project || projectId}
                    </Typography>
                  </Pressable>
                </>
              ) : (
                <AssignProject runId={run.runId} />
              )}
              {run.kind === "workflow" && (
                <>
                  <Sep />
                  <Typography as="span" type="label" variant="secondary">
                    {t("detail.workflow", { name: run.owner.toUpperCase() })}
                  </Typography>
                </>
              )}
            </Stack>
          </Stack>
          {actions}
        </Stack>
      </Container>
      <Progress
        data-testid={RunDetailHeaderTestId.Progress}
        height="25"
        label={t("detail.metric.progress")}
        tone={mode === "running" ? "run" : "accent"}
        value={progressPct}
      />
      <Container data-testid={RunDetailHeaderTestId.Metrics} padding={["0", "300"]}>
        <MetricStrip
          columns={compact ? 3 : 6}
          items={metrics.map((m) => ({ label: t(`detail.metric.${m.key}`), value: m.value }))}
        />
      </Container>
    </Stack>
  );
}
