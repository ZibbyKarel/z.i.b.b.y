import type { Agent } from "@zibby/contracts";
import {
  Card,
  Container,
  Divider,
  Icon,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { type Pipeline, type PipelineState, glyphForPhase } from "../../../../domain";
import { RunStateBadge } from "../../../runs/components/RunStateBadge";
import { type FeedStatus } from "../../../runs/run";
import { PipelineOwnerChip } from "./PipelineOwnerChip";

/**
 * Pipeline states map onto the canonical run-state tone/glyph (`RUN_STATE` in
 * `features/runs/run.ts`, via {@link RunStateBadge}) — one shared source of
 * tone/pulse so this can't re-diverge from the runs feed's coloring (that
 * divergence is why phase 42 deleted the old forked `stateMeta` map). The
 * label itself keeps its own pipeline-specific Czech phrasing (`stateDone` /
 * `stateParked` / `stateFailed` / `stateRunning`).
 */
const PIPELINE_STATE_TO_FEED_STATUS: Record<PipelineState, FeedStatus> = {
  done: "done",
  parked: "parked",
  failed: "error",
  running: "running",
};
const PIPELINE_STATE_LABEL_KEY = {
  done: "stateDone",
  parked: "stateParked",
  failed: "stateFailed",
  running: "stateRunning",
} as const satisfies Record<PipelineState, string>;

export interface PipelineCardProps {
  showPhases?: boolean;
  pipeline: Pipeline;
  agents: Agent[];
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Master-list card for a pipeline: name, state, phase chips + last run. */
export function PipelineCard({
  pipeline,
  showPhases,
  agents,
  selected,
  onSelect,
}: PipelineCardProps) {
  const t = useTranslations("pipelines");
  return (
    <Card
      aria-pressed={selected}
      as="button"
      interactive={!selected}
      onClick={() => onSelect(pipeline.id)}
      selected={selected}
    >
      <Container padding="150">
        <Stack gap="150">
          <Stack align="start" direction="row" gap="150">
            <IconTile alt={pipeline.name} glyph="flow" size="md" src={pipeline.avatar} />
            <Stack gap="75">
              <Stack align="center" direction="row" gap="100" justify="between">
                <Typography mono size="md" type="note" weight="bold">
                  {pipeline.name}
                </Typography>
                <RunStateBadge
                  label={t(PIPELINE_STATE_LABEL_KEY[pipeline.lastState])}
                  status={PIPELINE_STATE_TO_FEED_STATUS[pipeline.lastState]}
                />
              </Stack>
              <Typography leading="snug" size="caption" type="note" variant="secondary">
                {pipeline.desc}
              </Typography>
            </Stack>
          </Stack>

          <Stack wrap align="center" direction="row" gap="75">
            {showPhases &&
              pipeline.phases.map((ph, i) => (
                <Fragment key={`${ph.agent ?? ph.type}-${i}`}>
                  <Stack inline align="center" direction="row" gap="50">
                    <Icon name={glyphForPhase(ph, agents)} size="xs" tone="accent" />
                    <Typography mono size="xs" type="note" variant="secondary">
                      {ph.type === "verify" ? t("verify") : ph.agent}
                    </Typography>
                  </Stack>
                  {i < pipeline.phases.length - 1 && <Icon name="arrow" size="xs" tone="faint" />}
                </Fragment>
              ))}
          </Stack>

          <Divider />
          <Stack align="center" direction="row" justify="between">
            {pipeline.ownerSubsystem ? (
              <PipelineOwnerChip ownerSubsystem={pipeline.ownerSubsystem} />
            ) : (
              <span />
            )}
            <Typography mono size="xs" type="note" variant="tertiary">
              {t("cardLastRun", { lastRun: pipeline.lastRun })}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
