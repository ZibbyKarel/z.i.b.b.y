import { Card, Container, Icon, type IconName, Stack, Typography } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { formatCostUsd } from "../../../utils/cost";
import { resumeEta } from "../../../utils/time";
import { type RunView, runTitle } from "../run";
import { RunStateBadge } from "./RunStateBadge";

export interface TaskCardProps {
  run: RunView;
  /** Glyph of the routed agent/pipeline (or the kind fallback). */
  glyph: IconName;
  selected: boolean;
  stateLabel: string;
  startedLabel: string;
  /** Render-stable now (epoch ms) for the limit-pause / deferral countdown. */
  now: number;
  onSelect: (id: string) => void;
}

/**
 * One row in the task feed (master list). Task-first: what the user asked for is
 * the headline; the routed agent/pipeline is just a small glyph + id in the
 * footer next to state and time.
 */
export function TaskCard({
  run,
  glyph,
  selected,
  stateLabel,
  startedLabel,
  now,
  onSelect,
}: TaskCardProps) {
  const t = useTranslations("runs");
  const locale = useLocale();
  const live = run.status === "running" || run.status === "awaiting-approval";
  const headline = runTitle(run);
  // The task-origin line is only worth a row when it adds something the
  // headline doesn't already say.
  const taskLine = run.taskTitle && run.taskTitle !== headline ? run.taskTitle : "";
  // Phase 8 budget holds + Phase 9 limit pauses: a held task points at its approval;
  // a queued task says which engagement it's waiting on a slot for; a limit-paused run
  // (or a window-deferred scheduled task) counts down to the window reset.
  const caption =
    run.status === "held"
      ? t("heldCaption", { reason: run.heldReason ?? "" })
      : run.status === "queued"
        ? t("queuedCaption", { project: run.projectId ?? "" })
        : run.status === "paused-limit"
          ? t("pausedLimitCaption", { eta: resumeEta(run.resumeAt, now, locale) })
          : run.status === "scheduled" && run.deferredLimit
            ? t("deferredLimitCaption", {
                eta: resumeEta(Date.parse(run.startedAt), now, locale),
              })
            : "";
  return (
    <Card
      as="button"
      corners={live}
      onClick={() => onSelect(run.runId)}
      selected={selected}
      tone={live ? (run.status === "running" ? "run" : "warn") : undefined}
    >
      <Container padding="200">
        <Stack gap="100">
          <Typography mono truncate type="note" weight="bold">
            {headline}
          </Typography>
          {run.prompt && run.prompt !== headline && (
            <Typography truncate size="sm" type="text" variant="secondary">
              {run.prompt}
            </Typography>
          )}
          {taskLine && (
            <Typography mono truncate size="2xs" type="note" variant="tertiary">
              {t("metaTask")} · {taskLine}
            </Typography>
          )}
          {caption && (
            <Typography
              truncate
              size="2xs"
              tone={run.status === "held" ? "warn" : undefined}
              type="note"
              variant={run.status === "held" ? undefined : "tertiary"}
            >
              {caption}
            </Typography>
          )}
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <RunStateBadge canonTitle={run.status} label={stateLabel} status={run.status} />
              {run.taskOutcome && (
                <Typography
                  mono
                  size="2xs"
                  tone={run.taskOutcome === "done" ? "ok" : "bad"}
                  type="note"
                >
                  {t("metaTask")} → {t(`taskOutcome.${run.taskOutcome}`)}
                </Typography>
              )}
            </Stack>
            <Stack align="center" direction="row" gap="50">
              {run.costUsd != null && (
                <Typography mono size="2xs" type="note" variant="tertiary">
                  {formatCostUsd(run.costUsd)}
                </Typography>
              )}
              {run.owner && <Icon name={glyph} size="xs" tone="faint" />}
              <Typography mono size="2xs" type="note" variant="tertiary">
                {run.owner ? `${run.owner} · ` : ""}
                {run.project ? `${run.project} · ` : ""}
                {startedLabel}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
