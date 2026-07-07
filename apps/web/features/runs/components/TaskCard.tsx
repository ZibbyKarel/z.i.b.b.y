import {
  Card,
  Container,
  type IconName,
  IconTile,
  Progress,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { resumeEta } from "../../../utils/time";
import { type RunView, runStateTone, runTitle } from "../run";
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
 * the headline; the routed agent/pipeline is a glyph tile + a small kind tag
 * (v-runs.png: "skill"/"pipeline") top-right. The left edge is a solid accent
 * bar in the run's state color (matte — only a running/awaiting-approval card
 * additionally glows via `tone`+`living`); a state-tinted progress bar sits
 * between the description and the state chip.
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
  const tone = runStateTone(run.status);
  // Agent runs carry a live `pct`; a done run of any kind reads as complete.
  // Pipeline/goal runs otherwise have no run-level percentage (only their stage
  // timeline does) — the bar is honestly omitted rather than a fabricated guess.
  const pct = run.status === "done" ? 100 : (run.pct ?? null);
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
  const footer = [run.project, startedLabel].filter(Boolean).join(" · ");
  return (
    <Card
      as="button"
      edge={tone}
      living={live}
      onClick={() => onSelect(run.runId)}
      selected={selected}
      tone={live ? (run.status === "running" ? "run" : "warn") : undefined}
    >
      <Container padding="200">
        <Stack gap="100">
          <Stack align="start" direction="row" gap="100" justify="between">
            <Container grow minW0>
              <Stack align="center" direction="row" gap="100">
                <IconTile glyph={glyph} size="sm" />
                <Typography mono truncate type="note" weight="bold">
                  {headline}
                </Typography>
              </Stack>
            </Container>
            <Tag>{t(`kind.${run.kind}`)}</Tag>
          </Stack>
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
          {pct != null && (
            <Stack align="center" direction="row" gap="100">
              <Container grow>
                <Progress tone={tone ?? "accent"} value={pct} />
              </Container>
              <Typography mono size="2xs" tone={tone} type="note">
                {pct}%
              </Typography>
            </Stack>
          )}
          <Stack align="center" direction="row" gap="100" justify="between">
            <RunStateBadge canonTitle={run.status} label={stateLabel} status={run.status} />

            {footer && (
              <Typography mono size="2xs" type="note" variant="tertiary">
                {footer}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
