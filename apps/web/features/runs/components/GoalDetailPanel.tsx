"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  CodeBlock,
  Icon,
  Progress,
  Stack,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useGoalsQuery } from "../../goals/queries";
import { useResumeGoalRunMutation } from "../../goals/mutations";
import type { RunView } from "../run";

export interface GoalDetailPanelProps {
  run: RunView;
}

/**
 * The goal-loop detail surface (Phase 10.4): a cost bar (iterations-used /
 * maxIterations — the goal's only cost currency), a per-iteration timeline (maker
 * status + verifier verdict), and, when the goal is parked, the resume-with-note
 * panel (the same UX as a parked pipeline run, distinct endpoint).
 */
export function GoalDetailPanel({ run }: GoalDetailPanelProps) {
  const t = useTranslations("runs");
  const { data: goals = [] } = useGoalsQuery();
  const resume = useResumeGoalRunMutation();
  const [note, setNote] = useState("");

  const iterations = run.iterations ?? [];
  const goal = goals.find((g) => g.id === run.goalId);
  const maxIterations = goal?.maxIterations ?? iterations.length;
  const used = iterations.length;
  const pct = maxIterations > 0 ? Math.min(100, (used / maxIterations) * 100) : 0;

  return (
    <Stack gap="200">
      <HudPanel padding="250" title={t("goalCost")}>
        <Stack gap="100">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Typography mono size="xs" type="note" variant="secondary">
              {t("goalIterations", { used, max: maxIterations })}
            </Typography>
          </Stack>
          <Progress label={t("goalCost")} tone={pct >= 100 ? "warn" : "accent"} value={pct} />
        </Stack>
      </HudPanel>

      <HudPanel padding="250" title={t("goalTimeline")}>
        {iterations.length === 0 ? (
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("goalNoIterations")}
          </Typography>
        ) : (
          <Stack gap="100">
            {iterations.map((it) => (
              <Stack
                align="center"
                direction="row"
                gap="100"
                justify="between"
                key={it.index}
              >
                <Stack align="center" direction="row" gap="100">
                  <Typography mono size="xs" type="note" variant="secondary" weight="semibold">
                    {t("goalIteration", { n: it.index + 1 })}
                  </Typography>
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {t(`goalMakerStatus.${it.status}`)}
                  </Typography>
                </Stack>
                <Stack align="center" direction="row" gap="50">
                  <Icon
                    name={it.verifier.satisfied ? "ok" : "x"}
                    size="xs"
                    tone={it.verifier.satisfied ? "ok" : "bad"}
                  />
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {it.verifier.satisfied ? t("goalVerifierPass") : t("goalVerifierFail")}
                  </Typography>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </HudPanel>

      {run.status === "parked" && run.goalParked && (
        <HudPanel padding="250" title={t("parkedContext")} tone="warn">
          <Stack gap="200">
            <Typography mono size="xs" type="note" variant="secondary">
              {t("goalParkedSummary", {
                reason: run.goalParkedReason ?? "iterations",
                attempts: run.goalParked.attempts,
              })}
            </Typography>
            {iterations.length > 0 && iterations[iterations.length - 1]?.verifier.output && (
              <CodeBlock maxHeight="md" text={iterations[iterations.length - 1]!.verifier.output} />
            )}
            <TextAreaField
              label={t("resumeNote")}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("resumeNotePlaceholder")}
              value={note}
            />
            <Stack direction="row" justify="end">
              <Button
                disabled={resume.isPending}
                icon="run"
                onClick={() =>
                  resume.mutate({
                    params: { goalRunId: run.runId },
                    body: { note: note.trim() || undefined },
                  })
                }
                size="sm"
              >
                {t("resumeWithNote")}
              </Button>
            </Stack>
          </Stack>
        </HudPanel>
      )}
    </Stack>
  );
}
