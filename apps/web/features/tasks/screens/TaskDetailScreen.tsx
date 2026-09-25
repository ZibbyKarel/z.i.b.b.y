"use client";

import { DEPARTMENTS } from "@zibby/contracts";
import type { SubtaskSummary } from "@zibby/contracts";
import {
  ApprovalCard,
  Button,
  ChainRouteStrip,
  type ChainRouteStripStep,
  Container,
  EmptyState,
  IconTile,
  Panel,
  Stack,
  StatePill,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { compactAgo } from "../../../utils/time";
import { useApprovalsQuery, useApproveMutation } from "../../approvals";
import { HIGH_RISK_TYPES, formatWaited } from "../../approvals/approval";
import { useDepartmentRosterQuery } from "../../departments/queries";
import { RunDetail } from "../../runs/components/RunDetail";
import { useRunGlyphMap } from "../../runs/queries/useRunsQuery";
import { useTaskRunQuery } from "../../runs/queries/useTaskRunQuery";
import { useRunActions } from "../../runs/useRunActions";
import { useTaskQuery } from "../queries";

function stepFor(subtask: SubtaskSummary, index: number): ChainRouteStripStep {
  return {
    code: (subtask.department ?? "?").toUpperCase(),
    name: subtask.department
      ? (DEPARTMENTS.find((d) => d.id === subtask.department)?.name ?? subtask.department)
      : `Sub ${index + 1}`,
    state: subtask.state,
  };
}

export interface TaskDetailScreenProps {
  taskId: string;
}

/**
 * `/work/tasks/[id]` — ZB-04b: a full `ChainRouteStrip` over the task's
 * subtasks (click a step to select it), the selected subtask's department +
 * roster + its dispatched run (reusing {@link RunDetail} verbatim, same
 * pattern as `features/archive/Screen.tsx`), pending approvals for it, and the
 * task's attachments. ZB-05a hasn't wired chain dispatch yet, so a single-step
 * "chain" of just the parent itself is the common case today.
 */
export function TaskDetailScreen({ taskId }: TaskDetailScreenProps) {
  const t = useTranslations("tasksWork");
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const glyphById = useRunGlyphMap();

  const { data: task, isPending, isError, refetch } = useTaskQuery(taskId);
  const { data: approvals = [] } = useApprovalsQuery();
  const approve = useApproveMutation();

  const [selectedIndex, setSelectedIndex] = useState(0);

  const steps = useMemo(() => (task ? task.subtasks.map((s, i) => stepFor(s, i)) : []), [task]);
  const selected: SubtaskSummary | undefined = task?.subtasks[selectedIndex];

  const selectedRunRef = selected?.runRef ?? (task?.subtasks.length ? undefined : task?.runRef);
  const {
    data: selectedRun,
    isPending: runPending,
    isError: runError,
  } = useTaskRunQuery(selectedRunRef ?? null);

  const rosterQuery = useDepartmentRosterQuery(selected?.department ?? "");

  const { stop, stopping, resume, resuming, remove, deleting } = useRunActions(
    () => undefined,
    () => undefined,
  );

  // Approvals whose run/task the selected subtask (or the task itself) owns.
  const relatedApprovals = approvals.filter(
    (a) => a.runId === (selectedRunRef ?? task?.id) || a.runId === task?.id,
  );

  if (isPending) {
    return (
      <Container padding={["300", "350"]}>
        <QueryLoading />
      </Container>
    );
  }

  if (isError || !task) {
    return (
      <Container padding={["300", "350"]}>
        <QueryError onRetry={() => void refetch()} />
      </Container>
    );
  }

  const displayId = `TSK-${task.id.slice(-4).toUpperCase()}`;

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack gap="50">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {displayId} · {t(`source.${task.source ?? "operator"}`)}
          </Typography>
          <Typography type="h1">{task.title || task.text.slice(0, 120)}</Typography>
          {task.title && (
            <Typography type="text" variant="secondary">
              {task.text}
            </Typography>
          )}
        </Stack>

        {steps.length > 0 ? (
          <Panel padding="300">
            <ChainRouteStrip
              onStepClick={setSelectedIndex}
              size="full"
              steps={steps.map((s, i) => ({ ...s, selected: i === selectedIndex }))}
            />
          </Panel>
        ) : (
          <EmptyState body={t("detail.noSubtasksBody")} title={t("detail.noSubtasksTitle")} />
        )}

        <Stack wrap direction="row" gap="200">
          <Stack gap="150" style={{ flex: "1 1 480px", minWidth: 0 }}>
            {selected && (
              <Panel header={t("detail.subtaskHeader", { id: selectedIndex + 1 })}>
                <Stack gap="150">
                  <Stack align="center" direction="row" gap="100">
                    <StatePill label={t(`state.${selected.state}`)} state={selected.state} />
                    <Typography type="note">
                      {selected.department
                        ? (DEPARTMENTS.find((d) => d.id === selected.department)?.name ??
                          selected.department)
                        : t("detail.unassigned")}
                    </Typography>
                    {selected.step != null && (
                      <Tag tone="neutral">{t("detail.step", { n: selected.step })}</Tag>
                    )}
                  </Stack>

                  <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                    {t("detail.roster")}
                  </Typography>
                  {rosterQuery.data && rosterQuery.data.agents.length > 0 ? (
                    <Stack wrap direction="row" gap="100">
                      {rosterQuery.data.agents.map((a) => (
                        <Tag key={a.id}>{a.name ?? a.id}</Tag>
                      ))}
                    </Stack>
                  ) : (
                    <Typography size="sm" type="note" variant="tertiary">
                      {t("detail.noRoster")}
                    </Typography>
                  )}
                </Stack>
              </Panel>
            )}

            <Panel header={t("detail.runHeader")}>
              {!selectedRunRef ? (
                <EmptyState body={t("detail.noRunBody")} title={t("detail.noRunTitle")} />
              ) : runPending ? (
                <QueryLoading />
              ) : runError || !selectedRun ? (
                <QueryError />
              ) : (
                <RunDetail
                  avatar={undefined}
                  deleting={deleting}
                  glyph={glyphById.get(selectedRun.owner) ?? "flow"}
                  now={now}
                  onDelete={() => remove(selectedRun.runId, selectedRun.kind)}
                  onResume={() => resume(selectedRun)}
                  onStop={() => stop(selectedRun)}
                  resuming={resuming}
                  run={selectedRun}
                  stopping={stopping}
                />
              )}
            </Panel>
          </Stack>

          <Stack gap="150" style={{ flex: "0 1 340px", minWidth: 280 }}>
            <Panel header={t("detail.approvalsHeader")}>
              {relatedApprovals.length === 0 ? (
                <Typography size="sm" type="note" variant="tertiary">
                  {t("detail.noApprovals")}
                </Typography>
              ) : (
                <Stack gap="100">
                  {relatedApprovals.map((a) => (
                    <ApprovalCard
                      agentName={a.skill}
                      density="row"
                      glyphSeed={a.skill}
                      highRisk={a.riskType != null && HIGH_RISK_TYPES.has(a.riskType)}
                      key={a.id}
                      meta={a.kind}
                      onApprove={() => approve.mutate({ params: { id: a.id }, body: {} })}
                      request={a.detail}
                      taskRef={a.runId}
                      waited={formatWaited(a.requestedAt)}
                    />
                  ))}
                </Stack>
              )}
            </Panel>

            <Panel header={t("detail.attachmentsHeader")}>
              {task.attachments.length === 0 ? (
                <Typography size="sm" type="note" variant="tertiary">
                  {t("detail.noAttachments")}
                </Typography>
              ) : (
                <Stack gap="75">
                  {task.attachments.map((att) => (
                    <Stack direction="row" gap="100" key={att.name}>
                      <IconTile glyph="doc" size="sm" />
                      <Typography size="sm" type="note">
                        {att.name}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Panel>

            <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
              {t("detail.created", { time: compactAgo(task.createdAt, now) })}
            </Typography>
          </Stack>
        </Stack>

        <Button intent="ghost" onClick={() => router.push("/work/tasks" as Route)} size="sm">
          {t("detail.back")}
        </Button>
      </Stack>
    </Container>
  );
}
