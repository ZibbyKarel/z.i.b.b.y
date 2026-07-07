import { Card, Container, type IconName, IconTile, Progress, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import Link from "next/link";
import { type RunView, runStateTone, runTitle } from "../../runs/run";
import { RunStateBadge } from "../../runs/components/RunStateBadge";

export enum ChatRunningTaskRowTestId {
  /** The whole row is the deep-link into `/runs?run=<id>`. */
  Link = "chat-running-task-row",
}

export interface ChatRunningTaskRowProps {
  run: RunView;
  /** Glyph of the routed agent/pipeline (or the kind fallback). */
  glyph: IconName;
  /** The routed entity's avatar (agent/pipeline), when it has one — else the glyph shows. */
  avatar?: string;
  /** Localized run-state label (Czech up front). */
  stateLabel: string;
  /** Localized `aria-label` for the row link ("Otevřít běh: …"). */
  openAria: string;
}

/**
 * One compact row in the chat's left "Běží" rail: the routed entity's avatar/glyph,
 * the task-first title, a state chip and — when the run carries a live percentage —
 * a slim progress bar. The whole row is a link into the HUD run detail
 * (`/runs?run=<id>`); the chat surface hands the run off to the runs page rather
 * than rendering its full log inline.
 *
 * Presentation mirrors the runs {@link TaskCard} but slimmed for the rail: the
 * left edge and glow read the shared {@link runStateTone} (single state map), and
 * the glow is reserved for a genuinely live run (running / awaiting-approval) —
 * consistent with the constellation/dock "glow only when live" rule.
 */
export function ChatRunningTaskRow({ run, glyph, avatar, stateLabel, openAria }: ChatRunningTaskRowProps) {
  const live = run.status === "running" || run.status === "awaiting-approval";
  const tone = runStateTone(run.status);
  const title = runTitle(run);
  // Only an agent run carries a run-level percentage; a pipeline/goal's progress
  // lives on its stage timeline, so the bar is honestly omitted rather than faked.
  const pct = run.pct ?? null;

  return (
    <Link
      aria-label={openAria}
      data-testid={ChatRunningTaskRowTestId.Link}
      href={`/runs?run=${run.runId}` as Route}
    >
      <Card
        edge={tone}
        living={live}
        tone={live ? (run.status === "running" ? "run" : "warn") : undefined}
      >
        <Container padding="150">
          <Stack gap="75">
            <Stack align="center" direction="row" gap="100">
              <IconTile alt="" glow={live} glyph={glyph} shape="circle" size="sm" src={avatar} />
              <Container grow minW0>
                <Typography mono truncate type="note" weight="bold">
                  {title}
                </Typography>
              </Container>
            </Stack>
            <Stack align="center" direction="row" gap="100" justify="between">
              <RunStateBadge canonTitle={run.status} label={stateLabel} status={run.status} />
              {pct != null && (
                <Typography mono size="2xs" tone={tone} type="note">
                  {pct}%
                </Typography>
              )}
            </Stack>
            {pct != null && <Progress tone={tone ?? "accent"} value={pct} />}
          </Stack>
        </Container>
      </Card>
    </Link>
  );
}
