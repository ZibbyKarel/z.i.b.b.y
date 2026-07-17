import { useState } from "react";
import {
  Card,
  Container,
  type DotTone,
  FloatingPanel,
  Icon,
  type IconName,
  IconTile,
  Progress,
  Stack,
  type StateTone,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { compactAgo } from "../../../utils/time";
import { type RunView, runStateTone, runTitle } from "../../runs/run";
import { RunStateBadge } from "../../runs/components/RunStateBadge";

export enum ChatTaskRowTestId {
  /** The whole row is a button that selects the run — opening its detail inline,
   * beside the panel (Phase 100). No longer a `/runs?run=<id>` navigation. */
  Row = "chat-task-row",
  /** The compact state strip: status dot, owner, state badge, relative start. */
  Meta = "chat-task-row-meta",
  /** The progress meter — only rendered when the run carries a live `pct`. */
  Progress = "chat-task-row-progress",
}

/** `StatusDot` speaks the dot vocabulary (`wait`, not `warn`); map the card's
 * canonical {@link StateTone} onto it so the meta row's dot always matches the
 * edge bar/border tone exactly (one state, one color, two vocabularies). */
const DOT_TONE_BY_STATE: Record<StateTone, DotTone> = {
  accent: "accent",
  ok: "ok",
  warn: "wait",
  bad: "bad",
  run: "run",
};

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
  /** This row's position in its list — the stagger seed `FloatingPanel` uses so
   * idle rows don't float in visible unison. Defaults to 0. */
  index?: number;
}

/**
 * One floating glass card in the chat's left tasks panel: a compact meta strip
 * (state dot, owner, state badge, relative start), the task-first title, an
 * "owner · phase" line, and — when the run carries a live percentage — a slim
 * progress meter. The whole card is a button that selects the run; the chat
 * screen renders its detail inline in a column beside the panel rather than
 * navigating to `/runs` (Phase 100 — mirrors the runs screen's own {@link TaskCard}).
 *
 * The card's left edge bar always reads the shared {@link runStateTone}
 * (defaulted to `"accent"` — every card carries a tinted edge, live or not),
 * so the state reads at a glance even for a matte, finished task. The tinted
 * border and glow (`tone`/`living`) are reserved for a genuinely in-flight run
 * (running / awaiting-approval) — per `Card`'s own contract, `tone` is not a
 * decoration to apply unconditionally, consistent with the constellation/dock
 * "glow only when live" rule.
 */
export function ChatTaskRow({
  run,
  glyph,
  avatar,
  stateLabel,
  openAria,
  selected,
  onSelect,
  index = 0,
}: ChatTaskRowProps) {
  const live = run.status === "running" || run.status === "awaiting-approval";
  // Mandatory default: `runStateTone` reads `undefined` for a neutral status
  // (scheduled/queued/interrupted) — this card always carries a tone.
  const tone = runStateTone(run.status) ?? "accent";
  const title = runTitle(run);
  // Only an agent run carries a run-level percentage; a pipeline/goal's progress
  // lives on its stage timeline, so the bar is honestly omitted rather than faked.
  const pct = run.pct ?? null;
  // A pipeline/goal run names its current stage; an agent run has none, so the
  // localized state label stands in — the line always has something to say.
  const phase = run.currentStage ?? stateLabel;
  // Computed once per mount (not per render) so "started Nm ago" stays purity-safe
  // without a live-ticking clock this compact row doesn't need.
  const [renderedAt] = useState(() => Date.now());

  const card = (
    <Card
      aria-label={openAria}
      as="button"
      data-testid={ChatTaskRowTestId.Row}
      edge={tone}
      living={live}
      onClick={() => onSelect(run.runId)}
      selected={selected}
      tone={live ? tone : undefined}
    >
      <Container padding="150">
        <Stack gap="75">
          <Stack
            align="center"
            data-testid={ChatTaskRowTestId.Meta}
            direction="row"
            gap="75"
            justify="between"
          >
            <Stack align="center" direction="row" gap="75">
              <StatusDot pulse={live} size="75" tone={DOT_TONE_BY_STATE[tone]} />
              <Typography mono size="2xs" tone={tone} type="note">
                {run.owner}
              </Typography>
              <RunStateBadge canonTitle={run.status} label={stateLabel} status={run.status} />
            </Stack>
            <Typography mono size="2xs" type="note" variant="tertiary">
              {compactAgo(run.startedAt, renderedAt)}
            </Typography>
          </Stack>
          <Stack align="center" direction="row" gap="100">
            <IconTile alt="" glow={live} glyph={glyph} shape="circle" size="sm" src={avatar} />
            <Container grow minW0>
              <Typography mono truncate type="note" weight="bold">
                {title}
              </Typography>
            </Container>
          </Stack>
          <Stack align="center" direction="row" gap="75">
            <Icon name={live ? "pulse" : "run"} size="xs" tone={tone} />
            <Container grow minW0>
              <Typography mono truncate size="2xs" type="note" variant="tertiary">
                {run.owner} · {phase}
              </Typography>
            </Container>
          </Stack>
          {pct != null && (
            <Stack
              align="center"
              data-testid={ChatTaskRowTestId.Progress}
              direction="row"
              gap="100"
            >
              <Container grow>
                <Progress tone={tone} value={pct} />
              </Container>
              <Typography mono size="2xs" tone={tone} type="note">
                {pct}%
              </Typography>
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  );

  return live ? card : <FloatingPanel index={index}>{card}</FloatingPanel>;
}
