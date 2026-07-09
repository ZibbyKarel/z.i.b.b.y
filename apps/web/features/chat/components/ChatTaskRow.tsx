import {
  Card,
  Container,
  type IconName,
  IconTile,
  Progress,
  Stack,
  Typography,
} from "@zibby/design-system";
import { type RunView, runStateTone, runTitle } from "../../runs/run";
import { RunStateBadge } from "../../runs/components/RunStateBadge";

export enum ChatTaskRowTestId {
  /** The whole row is a button that selects the run — opening its detail inline,
   * beside the panel (Phase 100). No longer a `/runs?run=<id>` navigation. */
  Row = "chat-task-row",
}

export interface ChatTaskRowProps {
  run: RunView;
  /** Glyph of the routed agent/pipeline (or the kind fallback). */
  glyph: IconName;
  /** The routed entity's avatar (agent/pipeline), when it has one — else the glyph shows. */
  avatar?: string;
  /** Localized run-state label (Czech up front). */
  stateLabel: string;
  /** Localized `aria-label` for the row button ("Otevřít běh: …"). */
  openAria: string;
  /** Whether this run's detail is the one currently open beside the panel — reads
   * as the card's selected state (accent border + ring), the sole "is this open"
   * indicator now that the separate expand chevron is gone (Phase 100). */
  selected: boolean;
  /** Selects (or, re-clicking the already-selected row, deselects) this run — the
   * panel resolves the click into the inline detail column beside it. */
  onSelect: (runId: string) => void;
}

/**
 * One compact row in the chat's left tasks panel: the routed entity's avatar/glyph,
 * the task-first title, a state chip and — when the run carries a live percentage —
 * a slim progress bar. The whole row is a button that selects the run; the chat
 * screen renders its detail inline in a column beside the panel rather than
 * navigating to `/runs` (Phase 100 — mirrors the runs screen's own {@link TaskCard}).
 *
 * Presentation mirrors the runs `TaskCard` but slimmed for the panel: the left edge
 * and glow read the shared {@link runStateTone} (single state map), and the glow is
 * reserved for a genuinely live run (running / awaiting-approval) — consistent with
 * the constellation/dock "glow only when live" rule. A finished or waiting task
 * renders matte (no glow), so the panel lists every task in scope while still
 * surfacing the live set at a glance.
 */
export function ChatTaskRow({
  run,
  glyph,
  avatar,
  stateLabel,
  openAria,
  selected,
  onSelect,
}: ChatTaskRowProps) {
  const live = run.status === "running" || run.status === "awaiting-approval";
  const tone = runStateTone(run.status);
  const title = runTitle(run);
  // Only an agent run carries a run-level percentage; a pipeline/goal's progress
  // lives on its stage timeline, so the bar is honestly omitted rather than faked.
  const pct = run.pct ?? null;

  return (
    <Card
      aria-label={openAria}
      as="button"
      data-testid={ChatTaskRowTestId.Row}
      edge={tone}
      living={live}
      onClick={() => onSelect(run.runId)}
      selected={selected}
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
  );
}
