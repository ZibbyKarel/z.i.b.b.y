import type { Agent } from "@zibby/contracts";
import { Card, Container, Divider, Icon, IconTile, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { type Workflow, type WorkflowState, glyphForPhase } from "../../../../domain";
import { RunStateBadge } from "../../../runs/components/RunStateBadge";
import { type FeedStatus } from "../../../runs/run";
import { WorkflowOwnerChip } from "./WorkflowOwnerChip";

/**
 * Workflow states map onto the canonical run-state tone/glyph (`RUN_STATE` in
 * `features/runs/run.ts`, via {@link RunStateBadge}) — one shared source of
 * tone/pulse so this can't re-diverge from the runs feed's coloring (that
 * divergence is why phase 42 deleted the old forked `stateMeta` map). The
 * label itself keeps its own workflow-specific Czech phrasing (`stateDone` /
 * `stateParked` / `stateFailed` / `stateRunning`).
 */
const WORKFLOW_STATE_TO_FEED_STATUS: Record<WorkflowState, FeedStatus> = {
  done: "done",
  parked: "parked",
  failed: "error",
  running: "running",
};
const WORKFLOW_STATE_LABEL_KEY = {
  done: "stateDone",
  parked: "stateParked",
  failed: "stateFailed",
  running: "stateRunning",
} as const satisfies Record<WorkflowState, string>;

export interface WorkflowCardProps {
  showPhases?: boolean;
  workflow: Workflow;
  agents: Agent[];
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Master-list card for a workflow: name, state, phase chips + last run. */
export function WorkflowCard({
  workflow,
  showPhases,
  agents,
  selected,
  onSelect,
}: WorkflowCardProps) {
  const t = useTranslations("workflows");
  return (
    <Card
      aria-pressed={selected}
      as="button"
      interactive={!selected}
      onClick={() => onSelect(workflow.id)}
      selected={selected}
    >
      <Container padding="150">
        <Stack gap="150">
          <Stack align="start" direction="row" gap="150">
            <IconTile alt={workflow.name} glyph="flow" size="md" src={workflow.avatar} />
            <Stack gap="75">
              <Stack align="center" direction="row" gap="100" justify="between">
                <Typography mono size="md" type="note" weight="bold">
                  {workflow.name}
                </Typography>
                <RunStateBadge
                  label={t(WORKFLOW_STATE_LABEL_KEY[workflow.lastState])}
                  status={WORKFLOW_STATE_TO_FEED_STATUS[workflow.lastState]}
                />
              </Stack>
              <Typography leading="snug" size="caption" type="note" variant="secondary">
                {workflow.desc}
              </Typography>
            </Stack>
          </Stack>

          <Stack wrap align="center" direction="row" gap="75">
            {showPhases &&
              workflow.phases.map((ph, i) => (
                <Fragment key={`${ph.agent ?? ph.type}-${i}`}>
                  <Stack inline align="center" direction="row" gap="50">
                    <Icon name={glyphForPhase(ph, agents)} size="xs" tone="accent" />
                    <Typography mono size="xs" type="note" variant="secondary">
                      {ph.type === "verify"
                        ? t("verify")
                        : ph.type === "workflow"
                          ? ph.workflow
                          : ph.agent}
                    </Typography>
                  </Stack>
                  {i < workflow.phases.length - 1 && <Icon name="arrow" size="xs" tone="faint" />}
                </Fragment>
              ))}
          </Stack>

          <Divider />
          <Stack align="center" direction="row" justify="between">
            {workflow.department ? (
              <WorkflowOwnerChip department={workflow.department} />
            ) : (
              <span />
            )}
            <Typography mono size="xs" type="note" variant="tertiary">
              {t("cardLastRun", { lastRun: workflow.lastRun })}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
