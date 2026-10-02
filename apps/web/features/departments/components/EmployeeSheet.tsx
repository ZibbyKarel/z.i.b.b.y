"use client";

import type { EmployeeWithState } from "@zibby/contracts";
import {
  AgentGlyph,
  Button,
  Container,
  Panel,
  Row,
  Sheet,
  Stack,
  StatePill,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { RunLogStream } from "../../runs/components/RunLogStream";
import { useRunsQuery } from "../../runs";

export enum EmployeeSheetTestId {
  EditLink = "employee-sheet-edit-link",
  TaskRow = "employee-sheet-task-row",
}

export interface EmployeeSheetProps {
  employee: EmployeeWithState | null;
  onClose: () => void;
}

/**
 * Quick-look detail of an employee over the People roster: identity, the live
 * log of the current run and every run the employee's agent owns (past runs and
 * still-scheduled tasks — the feed carries both). Edit leads to the full profile.
 */
export function EmployeeSheet({ employee, onClose }: EmployeeSheetProps) {
  const t = useTranslations("people");
  const tc = useTranslations("common");
  const { runs } = useRunsQuery();

  if (!employee) return null;
  const tasks = runs.filter((r) => r.owner === employee.agentId);

  return (
    <Sheet
      open
      closeLabel={tc("close")}
      headerActions={
        <Link data-testid={EmployeeSheetTestId.EditLink} href={`/org/people/${employee.id}`}>
          <Button icon="edit" intent="secondary" size="sm">
            {tc("edit")}
          </Button>
        </Link>
      }
      onClose={onClose}
      title={employee.name}
      width="lg"
    >
      <Stack gap="250">
        <Stack align="center" direction="row" gap="200">
          <AgentGlyph seed={employee.agentId} size={128} state={employee.state} />
          <Stack gap="75">
            <Typography type="h3">{employee.name}</Typography>
            <Typography size="sm" type="note" variant="secondary">
              {employee.position.title ?? employee.position.name}
            </Typography>
            <StatePill label={t(`state.${employee.state}`)} state={employee.state} />
          </Stack>
        </Stack>

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
          <Typography type="note" variant="tertiary">
            {t("noActiveRun")}
          </Typography>
        )}

        <Panel header={t("tasks")}>
          <Container padding="200">
            {tasks.length === 0 ? (
              <Typography type="note" variant="tertiary">
                {t("historyEmpty")}
              </Typography>
            ) : (
              <Stack gap="100">
                {tasks.map((r) => (
                  <Link
                    data-testid={EmployeeSheetTestId.TaskRow}
                    href={`/activity/runs/${r.runId}` as Route}
                    key={r.runId}
                  >
                    <Row gap="100">
                      <Tag>{r.status}</Tag>
                      <Container grow>
                        <Typography truncate type="labelSm">
                          {r.taskTitle ?? r.title}
                        </Typography>
                      </Container>
                      <Typography mono size="xs" type="note" variant="tertiary">
                        {r.startedAt}
                      </Typography>
                    </Row>
                  </Link>
                ))}
              </Stack>
            )}
          </Container>
        </Panel>
      </Stack>
    </Sheet>
  );
}
