"use client";

import type { DepartmentId, TaskParentState } from "@zibby/contracts";
import {
  AnchoredSheet,
  DetailTable,
  type DetailTableRow,
  SheetAction,
  SheetBlock,
  SheetSection,
  SheetText,
  StatCell,
  StatCellGrid,
  TextLink,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApprovalsQuery } from "../../../approvals";
import { ExternalAnchor } from "../../../inbox/components/links";
import { useElapsedLabel } from "../../../inbox/useElapsedLabel";
import { useDepartmentLookup } from "../../../departments/useDepartmentLookup";
import { useTaskQuery } from "../../../tasks";
import { taskState } from "../../state/taskState";
import { ApprovalNeed, isHighRisk } from "./ApprovalNeed";
import { type SheetProps, geometry } from "./sheetTypes";

/**
 * Task detail from `GET /api/tasks/:id`: chain cards + subtasks table over its subtasks, the
 * task text, the outcome and its PR. The reference's agents list has no per-task source in our
 * data, so it is not shown. A pending approval of the task (or of one of its subtask runs)
 * becomes the "needs you" card.
 */
export function TaskSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const departments = useDepartmentLookup();
  const elapsed = useElapsedLabel();
  const { data: task } = useTaskQuery(id);
  const { data: approvals = [] } = useApprovalsQuery();
  const [now] = useState(() => Date.now());

  if (!task) return null;

  const state = taskState(task);
  const refs = new Set([
    task.id,
    task.runRef,
    ...task.subtasks.flatMap((s) => [s.taskId, s.runRef]),
  ]);
  const approval = approvals.find((a) => refs.has(a.runId));
  const title = task.title || task.text.slice(0, 120);
  const dept = (d: DepartmentId | undefined) => (d ? departments.name(d) : "—");
  const code = (d: DepartmentId | undefined) => (d ?? "?").toUpperCase();
  const stateText = (s: TaskParentState) => t(`tasksWork.state.${s}`).toUpperCase();
  const stateLabel = t(`tasksWork.state.${state}`).toUpperCase();
  const none = t("bridge.sheet.none");

  const subRows: DetailTableRow[] = task.subtasks.map((s) => ({
    tone: s.state,
    cells: [
      s.taskId.slice(-6).toUpperCase(),
      code(s.department),
      s.step === undefined ? "—" : t("bridge.sheet.task.step", { n: s.step }),
      stateText(s.state),
      s.runRef ?? "—",
    ],
  }));
  const pr = task.outcome?.pr;
  const artifactRows: DetailTableRow[] = pr
    ? [
        {
          cells: [
            t("bridge.sheet.kind.pr"),
            <TextLink href={pr.url} key="pr" linkComponent={ExternalAnchor}>
              {pr.url.replace(/^https?:\/\//, "")}
            </TextLink>,
          ],
        },
      ]
    : [];
  const lines = [task.text, ...(task.outcome ? [task.outcome.summary] : [])].filter(Boolean);

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      chips={[
        task.department ? dept(task.department).toUpperCase() : t("bridge.sheet.task.noDepartment"),
        (task.projectId ?? t("bridge.sheet.task.noProject")).toUpperCase(),
        ...(task.source
          ? [t("bridge.sheet.task.from", { source: task.source.toUpperCase() })]
          : []),
        t("bridge.sheet.created", { when: elapsed(task.createdAt, now).toUpperCase() }),
      ]}
      closeLabel={t("bridge.sheet.close")}
      footerEnd={
        approval && isHighRisk(approval) ? (
          <SheetAction
            intent="primary"
            onClick={() => router.push(`/work/tasks/${task.id}?approval=${approval.id}` as Route)}
          >
            {t("bridge.sheet.task.openApproval")}
          </SheetAction>
        ) : null
      }
      footerStart={
        <SheetAction onClick={() => router.push(`/work/tasks/${task.id}` as Route)}>
          {t("bridge.sheet.task.open")}
        </SheetAction>
      }
      hint={t("bridge.sheet.hint")}
      kind={`${t("bridge.sheet.kind.task")} · TSK-${task.id.slice(-4).toUpperCase()}`}
      onClose={onClose}
      stateLabel={stateLabel}
      title={title}
      tone={state}
    >
      {approval ? <ApprovalNeed approval={approval} /> : null}
      <SheetSection>
        <SheetBlock label={t("bridge.sheet.description")}>
          <SheetText lines={lines.flatMap((l) => l.split("\n"))} />
        </SheetBlock>
        {task.subtasks.length > 0 ? (
          <SheetBlock
            label={t("bridge.sheet.task.chain", {
              n: String(task.subtasks.length).padStart(2, "0"),
            })}
          >
            <StatCellGrid columns="fit">
              {task.subtasks.map((s, i) => (
                <StatCell
                  filled={s.state !== "done"}
                  key={s.taskId}
                  label={`${String(i + 1).padStart(2, "0")} · ${code(s.department)}`}
                  meta={
                    s.step === undefined ? undefined : t("bridge.sheet.task.step", { n: s.step })
                  }
                  status={stateText(s.state)}
                  title={dept(s.department)}
                  tone={s.state}
                />
              ))}
            </StatCellGrid>
          </SheetBlock>
        ) : null}
        {task.subtasks.length > 0 ? (
          <SheetBlock label={t("bridge.sheet.task.subtasks")}>
            <DetailTable rows={subRows} variant="subtask" />
          </SheetBlock>
        ) : null}
        <SheetBlock label={t("bridge.sheet.task.artifacts")}>
          <DetailTable emptyText={none} rows={artifactRows} />
        </SheetBlock>
      </SheetSection>
    </AnchoredSheet>
  );
}
