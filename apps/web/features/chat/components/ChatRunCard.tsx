import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  Container,
  Icon,
  Pressable,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { TaskTarget } from "@zibby/contracts";
import { usePipelineRunQuery } from "../../pipelines";
import { ChainStepsPanel } from "../../runs/components/ChainStepsPanel";
import { PipelineStageTimeline } from "../../runs/components/PipelineStageTimeline";
import { RunStateBadge } from "../../runs/components/RunStateBadge";
import type { RunView } from "../../runs/run";
import { TargetIdentity } from "./ChatMessage";

export interface ChatRunCardProps {
  /** The dispatched run's id (`ChatToolEvent.runRef`) — the same id the runs
   * screen deep-links with (`/runs?run=<runRef>`). */
  runRef: string;
  /** The routing target the dispatch went to, when known — rendered as the same
   * identity chip `ChatMessage` uses for a flat tool row. */
  target?: TaskTarget;
}

export enum ChatRunCardTestId {
  Root = "chat-run-card",
  Loading = "chat-run-card-loading",
  Header = "chat-run-card-header",
  Toggle = "chat-run-card-toggle",
  Link = "chat-run-card-link",
  Detail = "chat-run-card-detail",
}

/**
 * Compact progress caption for the collapsed header: a pipeline shows the phase
 * currently executing plus how many of its recorded stage runs are done; a chain
 * shows the position of its first not-yet-done step out of the total. `TaskRun`
 * carries no explicit "current step" index for chains (unlike a pipeline's
 * `currentStage`) — the first step whose status isn't `done` stands in for it, so
 * the caption reads correctly for both a mid-flight run and a finished one (where
 * that search finds nothing and the count falls back to the full length). An
 * agent run (neither stages nor steps) has no progress line — its `RunStateBadge`
 * is the whole story.
 */
function runProgress(run: RunView): string | null {
  if (run.steps && run.steps.length > 0) {
    const activeIndex = run.steps.findIndex((step) => step.status !== "done");
    const position = activeIndex === -1 ? run.steps.length : activeIndex + 1;
    return `${position}/${run.steps.length}`;
  }
  if (run.stageRuns && run.stageRuns.length > 0) {
    const done = run.stageRuns.filter((stage) => stage.status === "done").length;
    return run.currentStage
      ? `${run.currentStage} · ${done}/${run.stageRuns.length}`
      : `${done}/${run.stageRuns.length}`;
  }
  return null;
}

/**
 * The expanded detail: a chain run folds its steps ({@link ChainStepsPanel}), a
 * pipeline run its stage timeline ({@link PipelineStageTimeline}) — the same
 * components the runs screen itself uses (Fáze 14.3, Rozhodnutí 5), so there is no
 * parallel log/timeline rendering to keep in sync. An agent run has neither and
 * shows no detail (the runs page, not the chat card, is where its log lives).
 */
function runDetail(run: RunView, runRef: string) {
  if (run.steps && run.steps.length > 0) return <ChainStepsPanel run={run} />;
  if (run.stageRuns) {
    return (
      <PipelineStageTimeline
        currentStage={run.currentStage}
        live={run.status === "running"}
        owner={run.owner}
        pipelineRunId={runRef}
        stageRuns={run.stageRuns}
      />
    );
  }
  return null;
}

/**
 * The inline "living" run card a dispatched tool event upgrades to once its
 * `runRef` is known (Fáze 14.3). Reuses the runs screen's own presentational
 * components and its `usePipelineRunQuery(runRef)` — one query serves the agent,
 * pipeline AND chain shape alike, since they're all the same unified `TaskRun`
 * aggregate (Rozhodnutí 5). Freshness rides the shared `RunEventsProvider`
 * invalidation bus (Fáze 14.4) plus that query's own 1s fallback poll — this
 * component does not read the chat SSE stream at all (Rozhodnutí 6).
 *
 * Collapsed by default: a state badge, the dispatch target's identity chip, and a
 * compact progress caption. The `/runs?run=` link is always visible and never
 * toggles the expansion (its click stops propagation before it reaches the
 * toggle).
 */
export function ChatRunCard({ runRef, target }: ChatRunCardProps) {
  const t = useTranslations("chat.runCard");
  const tRuns = useTranslations("runs");
  const [expanded, setExpanded] = useState(false);
  const { data: run } = usePipelineRunQuery(runRef);

  const openRunLink = (
    <Link
      aria-label={t("openRunAria")}
      data-testid={ChatRunCardTestId.Link}
      href={`/runs?run=${runRef}` as Route}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="arrow" size="sm" tone="accent" />
    </Link>
  );

  if (!run) {
    return (
      <Card background="surface" data-testid={ChatRunCardTestId.Root} radius="lg">
        <Container padding={["100", "150"]}>
          <Stack
            align="center"
            data-testid={ChatRunCardTestId.Loading}
            direction="row"
            gap="75"
            justify="between"
          >
            <Stack align="center" direction="row" gap="75">
              <StatusDot tone="idle" />
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("loading")}
              </Typography>
            </Stack>
            {openRunLink}
          </Stack>
        </Container>
      </Card>
    );
  }

  const progress = runProgress(run);
  const detail = expanded ? runDetail(run, runRef) : null;

  return (
    <Card background="surface" data-testid={ChatRunCardTestId.Root} radius="lg">
      <Container padding={["100", "150"]}>
        <Stack
          align="center"
          data-testid={ChatRunCardTestId.Header}
          direction="row"
          gap="100"
          justify="between"
        >
          <Stack grow>
            <Pressable
              aria-expanded={expanded}
              aria-label={t(expanded ? "collapseAria" : "expandAria")}
              data-testid={ChatRunCardTestId.Toggle}
              onClick={() => setExpanded((v) => !v)}
            >
              <Stack wrap align="center" direction="row" gap="100">
                <RunStateBadge
                  canonTitle={run.status}
                  label={tRuns(`state.${run.status}`)}
                  status={run.status}
                />
                {target && <TargetIdentity targets={[target]} />}
                {progress && (
                  <Typography mono size="xs" type="note" variant="tertiary">
                    {progress}
                  </Typography>
                )}
              </Stack>
            </Pressable>
          </Stack>
          {openRunLink}
        </Stack>
      </Container>
      {detail && (
        <Container
          data-testid={ChatRunCardTestId.Detail}
          maxHeight="320px"
          overflowY="auto"
          padding={["0", "150", "150", "150"]}
        >
          {detail}
        </Container>
      )}
    </Card>
  );
}
