import {
  Card,
  Container,
  Icon,
  type IconName,
  IconTile,
  Pressable,
  Progress,
  Stack,
  Typography,
  cn,
} from "@zibby/design-system";
import type { Route } from "next";
import Link from "next/link";
import { type RunView, runStateTone, runTitle } from "../../runs/run";
import { RunStateBadge } from "../../runs/components/RunStateBadge";

export enum ChatTaskRowTestId {
  /** The whole row is the deep-link into `/runs?run=<id>`. */
  Link = "chat-task-row",
  /** Phase 92: the chevron that expands/collapses the inline live view — a
   * SIBLING of {@link Link}, not nested inside it, so toggling it never fires
   * the row's own navigation. */
  Expand = "chat-task-row-expand",
}

export interface ChatTaskRowProps {
  run: RunView;
  /** Glyph of the routed agent/pipeline (or the kind fallback). */
  glyph: IconName;
  /** The routed entity's avatar (agent/pipeline), when it has one — else the glyph shows. */
  avatar?: string;
  /** Localized run-state label (Czech up front). */
  stateLabel: string;
  /** Localized `aria-label` for the row link ("Otevřít běh: …"). */
  openAria: string;
  /**
   * Phase 92: whether this row's inline live view is currently expanded. Omit
   * together with {@link onToggleExpand} for a kind with no inline view (goal,
   * scheduled) — the row then renders no chevron at all, unchanged from before.
   */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Localized `aria-label` for the chevron ("zobrazit nebo skrýt…"). */
  expandAria?: string;
}

/**
 * One compact row in the chat's left tasks panel: the routed entity's avatar/glyph,
 * the task-first title, a state chip and — when the run carries a live percentage —
 * a slim progress bar. The whole row is a link into the HUD run detail
 * (`/runs?run=<id>`); the chat surface hands the run off to the runs page rather
 * than rendering its full log inline.
 *
 * Presentation mirrors the runs {@link TaskCard} but slimmed for the panel: the
 * left edge and glow read the shared {@link runStateTone} (single state map), and
 * the glow is reserved for a genuinely live run (running / awaiting-approval) —
 * consistent with the constellation/dock "glow only when live" rule. A finished or
 * waiting task renders matte (no glow), so the panel lists every task in scope while
 * still surfacing the live set at a glance.
 */
export function ChatTaskRow({
  run,
  glyph,
  avatar,
  stateLabel,
  openAria,
  expanded,
  onToggleExpand,
  expandAria,
}: ChatTaskRowProps) {
  const live = run.status === "running" || run.status === "awaiting-approval";
  const tone = runStateTone(run.status);
  const title = runTitle(run);
  // Only an agent run carries a run-level percentage; a pipeline/goal's progress
  // lives on its stage timeline, so the bar is honestly omitted rather than faked.
  const pct = run.pct ?? null;

  return (
    // Phase 92: `position="relative"` so the chevron below can overlay the card's
    // top-right corner as a SIBLING of the `Link` — never nested inside the anchor,
    // so it never triggers the row's own `/runs?run=<id>` navigation, and the whole
    // card stays clickable exactly as before.
    <Container position="relative">
      <Link
        aria-label={openAria}
        data-testid={ChatTaskRowTestId.Link}
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
                {/* Reserves room so the title never runs under the overlaid chevron. */}
                {onToggleExpand && <Container shrink={false} width="1.25rem" />}
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
      {onToggleExpand && (
        <Container position="absolute" right="0.875rem" top="0.875rem">
          <Pressable
            aria-expanded={expanded}
            aria-label={expandAria}
            data-testid={ChatTaskRowTestId.Expand}
            onClick={onToggleExpand}
          >
            <Icon
              className={cn("transition-transform duration-150", expanded && "rotate-90")}
              name="chevron"
              size="xs"
              tone="faint"
            />
          </Pressable>
        </Container>
      )}
    </Container>
  );
}
