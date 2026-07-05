"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Stack, Tag, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { usePipelineRunQuery } from "../../pipelines";
import type { RunView } from "../run";
import { PipelineStageTimeline } from "./PipelineStageTimeline";

export interface ChainStepsPanelProps {
  run: RunView;
}

export enum ChainStepsPanelTestId {
  Row = "chain-step-row",
  OpenLog = "chain-step-log",
}

/** Tone for a chain step's status tag. */
function stepTone(status: string): "ok" | "bad" | "run" | "neutral" {
  if (status === "done") return "ok";
  if (status === "failed") return "bad";
  if (status === "running") return "run";
  return "neutral";
}

/**
 * The chain-run detail surface (Phase 05): each step is one pipeline run, folded in
 * the same way a goal folds its maker/verifier iterations — the open step delegates to
 * the existing {@link PipelineStageTimeline}, fetched by the step's `runRef`.
 */
export function ChainStepsPanel({ run }: ChainStepsPanelProps) {
  const t = useTranslations("runs");
  // At most one step's timeline open at a time ⇒ at most one live poller mounted.
  const [openStep, setOpenStep] = useState<number | null>(null);
  const steps = run.steps ?? [];
  const openRef = steps.find((s) => s.index === openStep)?.runRef ?? null;
  const { data: openPipeline } = usePipelineRunQuery(openRef);

  return (
    <HudPanel padding="250" title={t("chainSteps")}>
      {steps.length === 0 ? (
        <Typography mono size="xs" type="note" variant="tertiary">
          {t("chainNoSteps")}
        </Typography>
      ) : (
        <Stack gap="100">
          {steps.map((step) => {
            const isOpen = openStep === step.index;
            return (
              <Stack data-testid={ChainStepsPanelTestId.Row} gap="50" key={step.index}>
                <Stack align="center" direction="row" gap="100" justify="between">
                  <Stack align="center" direction="row" gap="100">
                    <Icon name="flow" size="xs" tone="accent" />
                    <Typography mono size="xs" type="note" variant="secondary" weight="semibold">
                      {t("chainStep", { n: step.index + 1 })} · {step.pipeline}
                    </Typography>
                  </Stack>
                  <Stack align="center" direction="row" gap="100">
                    <Tag size="sm" tone={stepTone(step.status)}>
                      {t(`chainStepStatus.${step.status}`)}
                    </Tag>
                    {step.runRef && (
                      <Button
                        data-testid={ChainStepsPanelTestId.OpenLog}
                        icon="code"
                        intent="ghost"
                        onClick={() => setOpenStep(isOpen ? null : step.index)}
                        size="sm"
                      >
                        {t("goalOpenLog")}
                      </Button>
                    )}
                  </Stack>
                </Stack>

                {isOpen &&
                  step.runRef &&
                  (openPipeline ? (
                    <PipelineStageTimeline
                      currentStage={openPipeline.currentStage}
                      live={openPipeline.status === "running"}
                      owner={openPipeline.owner}
                      pipelineRunId={step.runRef}
                      stageRuns={openPipeline.stageRuns}
                    />
                  ) : (
                    <Typography mono size="2xs" type="note" variant="tertiary">
                      {t("stageLoading")}
                    </Typography>
                  ))}
              </Stack>
            );
          })}
        </Stack>
      )}
    </HudPanel>
  );
}
