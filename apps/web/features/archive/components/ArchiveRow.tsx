"use client";

import { Card, Container, Icon, Stack, Typography } from "@zibby/design-system";
import { RUN_STATE, type RunView, runStateTone, runTitle } from "../../runs/run";

export enum ArchiveRowTestId {
  Root = "archive-row-root",
  Dot = "archive-row-dot",
}

export interface ArchiveRowProps {
  run: RunView;
  /** Display name of the run's subsystem attribution (or the "bez subsystému"
   * fallback copy) — shown in the subline regardless of the page's active
   * grouping mode (design: `{subsystem} · {project}`). */
  subsystemName: string;
  /** The subsystem's registry colour for the leading dot — absent (no
   * subsystem attribution, D8) renders a neutral dot instead of a hue. */
  subsystemColor?: string;
  active: boolean;
  onSelect: (runId: string) => void;
  /** Pre-formatted duration/finish label (mono, trailing edge) — `""` when
   * there is nothing to show. */
  durationLabel: string;
}

/**
 * One row of the `/archiv` master list (F2, `docs/plans/hud2chat-F2-archive.md`)
 * — a design-literal, single-line row: subsystem-colour dot (with glow) → title
 * (ellipsis) → subline (`{subsystem} · {project}`, mono) → state glyph →
 * duration (mono). Deliberately NOT `TaskCard` (the live runs feed's heavier
 * card with a progress bar/caption/avatar tile) — the archive is finished tasks
 * only, so this matches `design/Z.I.B.B.Y/ZIBBY Archiv úloh.html`'s `ArRow`
 * 1:1 rather than the live feed's card.
 *
 * The active row's hue tint and the dot's glow are dynamic per-instance
 * colours DS's sealed `Card`/`Container` carry no token for — forwarded
 * through their `style` passthrough, the same sanctioned pattern as
 * `PipelineOwnerChip` and `SubsystemDrawer`'s `headerBandStyle`.
 */
export function ArchiveRow({
  run,
  subsystemName,
  subsystemColor,
  active,
  onSelect,
  durationLabel,
}: ArchiveRowProps) {
  const state = RUN_STATE[run.status];
  const tone = runStateTone(run.status);
  return (
    <Card
      as="button"
      data-testid={ArchiveRowTestId.Root}
      onClick={() => onSelect(run.runId)}
      selected={active}
      style={
        active && subsystemColor
          ? { background: `${subsystemColor}14`, borderColor: `${subsystemColor}55` }
          : undefined
      }
    >
      <Container padding="150">
        <Stack align="center" direction="row" gap="100">
          <Container
            data-testid={ArchiveRowTestId.Dot}
            height="7px"
            style={{
              background: subsystemColor ?? "var(--color-foreground-faint)",
              borderRadius: "50%",
              boxShadow: subsystemColor ? `0 0 6px ${subsystemColor}88` : undefined,
            }}
            width="7px"
          />
          <Container grow minW0>
            <Typography truncate size="sm" type="note" weight="medium">
              {runTitle(run)}
            </Typography>
            <Typography mono truncate size="2xs" type="note" variant="tertiary">
              {/* Join on the separator so a run with no project (or no owning
                  subsystem) does not render a dangling " · ". */}
              {[subsystemName, run.project].filter(Boolean).join(" · ")}
            </Typography>
          </Container>
          <Icon name={state.glyph} size="xs" tone={tone} />
          {durationLabel && (
            <Typography mono size="2xs" type="note" variant="tertiary">
              {durationLabel}
            </Typography>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
