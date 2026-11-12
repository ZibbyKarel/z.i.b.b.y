"use client";

import {
  AgentBadge,
  Container,
  CopyableText,
  Dropdown,
  Icon,
  type IconName,
  MetricStrip,
  Pressable,
  Progress,
  Stack,
  StatePill,
  type StateTone,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAgentSymbol } from "../../agents";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { prListHref } from "../../inbox/inbox";
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
  SourcePrLink = "run-detail-source-pr-link",
  SourceIssueLink = "run-detail-source-issue-link",
  OutputPrLink = "run-detail-output-pr-link",
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
  /** Inside a detail sheet: the sheet header already carries breadcrumb and title, metrics fold to 3 columns, no progress hairline. */
  compact?: boolean;
  /** Rendered under the metrics strip (the sheet's approval banner). */
  afterMetrics?: ReactNode;
  /** Open a PR in place (bridge sheet) instead of navigating to the PR list. */
  onOpenPr?: (url: string) => void;
  /** Open the source issue in place (bridge sheet) instead of navigating to its page. */
  onOpenIssue?: (projectId: string, itemId: string) => void;
}

function Sep() {
  return (
    <Typography as="span" type="labelSm">
      ·
    </Typography>
  );
}

/** GitLab merge requests live on a `gitlab` host or under `/-/merge_requests/`; everything else is GitHub. */
function prIcon(url: string): IconName {
  return /gitlab|\/-\/merge_requests\//i.test(url) ? "gitlab" : "github";
}

/** The run carries no issue source kind — a Jira-shaped key (`CZ-524`) gets the Jira mark. */
function issueIcon(label: string): IconName {
  return /^[A-Z][A-Z0-9]*-\d+$/.test(label) ? "jira" : "checkpoint";
}

/** A header link's label: optional leading icon + mono text. */
function LinkLabel({ icon, text }: { icon?: IconName; text: string }) {
  return (
    <Stack inline align="center" direction="row" gap="50">
      {icon && <Icon name={icon} size="xs" />}
      <Typography as="span" type="code">
        {text}
      </Typography>
    </Stack>
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
  afterMetrics,
  onOpenPr,
  onOpenIssue,
}: RunDetailHeaderProps) {
  const t = useTranslations("runs");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const departments = useDepartmentLookup();
  const symbolOf = useAgentSymbol();
  const { taskId, projectId, department, sourcePr } = run;
  const sourcePrRef = sourcePr ? `${sourcePr.repo}#${sourcePr.number}` : "";
  const openPr = (url: string) =>
    onOpenPr ? onOpenPr(url) : router.push(prListHref(url) as Route);
  // An implementation run's own PR (the source PR is the one a review-type run acts on).
  const outputPr = run.prOutput && run.prOutput.url !== sourcePr?.url ? run.prOutput : undefined;
  const outputPrRef = outputPr
    ? `#${outputPr.url.match(/\/(?:pull|merge_requests)\/(\d+)/)?.[1] ?? "PR"}`
    : "";
  const issueLabel = run.roadmapItemLabel ?? run.roadmapItemId ?? "";

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
                  underline="hover"
                >
                  <Typography as="span" type="labelSm" variant="secondary">
                    {t("detail.backToRuns")}
                  </Typography>
                </Pressable>
                <Typography as="span" type="labelSm">
                  /
                </Typography>
                <Typography as="span" type="code">
                  <CopyableText
                    copiedLabel={tCommon("copied")}
                    copyFailedLabel={tCommon("copyFailed")}
                    copyLabel={tCommon("copyId")}
                    text={run.runId}
                  />
                </Typography>
                <Sep />
                <Typography as="span" type="labelSm">
                  {t(`kind.${run.kind}`)}
                </Typography>
                {taskId && (
                  <>
                    <Sep />
                    <Pressable
                      data-testid={RunDetailHeaderTestId.TaskLink}
                      onClick={() => router.push(`/work/tasks/${taskId}`)}
                      underline="hover"
                    >
                      <LinkLabel text={taskId} />
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
                  underline="hover"
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
                    underline="hover"
                  >
                    <Typography as="span" type="label" variant="secondary">
                      {run.project || projectId}
                    </Typography>
                  </Pressable>
                </>
              ) : (
                <AssignProject runId={run.runId} />
              )}
              {sourcePr && (
                <>
                  <Sep />
                  <Pressable
                    aria-label={t("detail.sourcePr", { ref: sourcePrRef })}
                    data-testid={RunDetailHeaderTestId.SourcePrLink}
                    onClick={() => openPr(sourcePr.url)}
                    underline="hover"
                  >
                    <LinkLabel icon={prIcon(sourcePr.url)} text={sourcePrRef} />
                  </Pressable>
                </>
              )}
              {outputPr && (
                <>
                  <Sep />
                  <Pressable
                    aria-label={t("detail.outputPr", { ref: outputPrRef })}
                    data-testid={RunDetailHeaderTestId.OutputPrLink}
                    onClick={() => openPr(outputPr.url)}
                    underline="hover"
                  >
                    <LinkLabel icon={prIcon(outputPr.url)} text={outputPrRef} />
                  </Pressable>
                </>
              )}
              {projectId && run.roadmapItemId && (
                <>
                  <Sep />
                  <Pressable
                    aria-label={t("detail.sourceIssue", {
                      ref: issueLabel,
                    })}
                    data-testid={RunDetailHeaderTestId.SourceIssueLink}
                    onClick={() =>
                      onOpenIssue
                        ? onOpenIssue(projectId, run.roadmapItemId as string)
                        : router.push(
                            `/dashboard/inbox/issues/${projectId}/${run.roadmapItemId}` as Route,
                          )
                    }
                    underline="hover"
                  >
                    <LinkLabel icon={issueIcon(issueLabel)} text={issueLabel} />
                  </Pressable>
                </>
              )}
              {run.kind === "workflow" && !compact && (
                <>
                  <Sep />
                  <Typography as="span" type="label" variant="secondary">
                    {t("detail.workflow", { name: run.owner })}
                  </Typography>
                </>
              )}
            </Stack>
          </Stack>
          {actions}
        </Stack>
      </Container>
      {/* In the sheet the PROGRESS metric already says it. */}
      {!compact && (
        <Progress
          data-testid={RunDetailHeaderTestId.Progress}
          height="25"
          label={t("detail.metric.progress")}
          tone={mode === "running" ? "run" : "accent"}
          value={progressPct}
        />
      )}
      <Container data-testid={RunDetailHeaderTestId.Metrics} padding={["0", "300"]}>
        <MetricStrip
          columns={compact ? 3 : 6}
          items={metrics.map((m) => ({ label: t(`detail.metric.${m.key}`), value: m.value }))}
        />
      </Container>
      {afterMetrics}
    </Stack>
  );
}
