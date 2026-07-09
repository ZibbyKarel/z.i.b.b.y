"use client";

import { Container, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useActiveProject } from "../../projects";
import { ChainStepsPanel } from "../../runs/components/ChainStepsPanel";
import { PipelineStageTimeline } from "../../runs/components/PipelineStageTimeline";
import { RunLogStream } from "../../runs/components/RunLogStream";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import {
  type FeedStatus,
  type RunKind,
  runAvatar,
  runGlyph,
  runStateTone,
  runTitle,
} from "../../runs/run";
import { RUN_STATUS_GROUPS } from "../../runs/statusGroups";
import { ChatTaskRow } from "./ChatTaskRow";

export enum ChatTasksPanelTestId {
  Root = "chat-tasks-panel",
  List = "chat-tasks-panel-list",
  Empty = "chat-tasks-panel-empty",
  /** Phase 92: wraps one row + its (possibly absent) inline expanded view. */
  Row = "chat-tasks-panel-row",
  /** Phase 92: the bounded-height container the per-kind live view mounts into. */
  Expanded = "chat-tasks-panel-expanded",
}

/**
 * Kinds the panel can expand inline (Phase 92) — mirrors {@link AktivitaTab}'s recon:
 * only these three kinds carry a live view that can be mounted from a bare runId —
 * `RunLogStream` for an agent's single unified log, `PipelineStageTimeline` /
 * `ChainStepsPanel` for the other two (built on the existing stage-log stream, no
 * new transport). A `goal` run's surface is its iteration timeline (no bare-runId
 * view exists for it) and a `scheduled` row has no run behind it yet — both kinds
 * render no chevron at all, unchanged from before this phase.
 */
const EXPANDABLE_KINDS = new Set<RunKind>(["agent", "pipeline", "chain"]);

/**
 * The states that read as "live now" — a run actively progressing (`running`), one
 * accepted and spawning (`pending`), or one paused on the operator's decision at the
 * gate (`awaiting-approval`). These sort to the top of the panel; every other state
 * (waiting/scheduled, then finished) follows in {@link RUN_STATUS_GROUPS} order.
 */
const LIVE_STATES = new Set<FeedStatus>(["running", "pending", "awaiting-approval"]);

/**
 * Ordering rank for a task in the panel — smaller sorts first. Live states share the
 * top rank; the rest fall into their {@link RUN_STATUS_GROUPS} bucket order
 * (`running` → `waiting` → `done` → `error` → `parked`), the same vocabulary the runs
 * screen groups by, so the panel's ordering stays consistent with the feed. Offset by
 * one so a non-live status can never collide with the live rank.
 */
function taskRank(status: FeedStatus): number {
  if (LIVE_STATES.has(status)) return 0;
  const group = RUN_STATUS_GROUPS.findIndex((g) => g.statuses.includes(status));
  return 1 + (group < 0 ? RUN_STATUS_GROUPS.length : group);
}

/**
 * The chat page's left tasks panel: EVERY task in the active-project scope (Phase 57,
 * generalizing Phase 44's running-only rail), so the chat is a full task view — not
 * just a "what's running now" strip. Ordered so live tasks (running / spawning /
 * awaiting-approval) surface first, then waiting/scheduled, then finished — a stable
 * sort by {@link taskRank} preserving the feed's own (newest-first) order within each
 * bucket. Clicking a row still deep-links into `/runs?run=<id>`; the chat hands the
 * run off to the runs page rather than rendering its log inline.
 *
 * Reads the STABLE unified runs feed ({@link useRunsQuery}, kept fresh by the shared
 * SSE bus) rather than the chat data-layer, and honors the same active-project scope
 * the chat top bar switches (Phase 24/33): a real project shows only its own runs,
 * "Bez projektu" only unattributed ones — the same client-side filter the runs screen
 * uses. Scrollable, with a quiet empty hint when the scope has no tasks at all.
 */
export function ChatTasksPanel() {
  const t = useTranslations("chat.tasks");
  const tRuns = useTranslations("runs");
  const { runs } = useRunsQuery();
  const { activeProjectId } = useActiveProject();
  const glyphById = useRunGlyphMap();
  const avatarById = useRunAvatarMap();
  // Phase 92: at most one row expanded at a time (accordion) — keeps the narrow
  // column readable and, more importantly, bounds the live views' polling to a
  // single mounted stream regardless of how many tasks are in scope.
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const scoped =
    activeProjectId === null
      ? runs.filter((r) => !r.projectId)
      : runs.filter((r) => r.projectId === activeProjectId);
  // Live first, then waiting/scheduled, then finished. `Array.prototype.sort` is
  // stable, so the feed's own newest-first order is kept within each rank.
  const ordered = [...scoped].sort((a, b) => taskRank(a.status) - taskRank(b.status));

  return (
    <Container data-testid={ChatTasksPanelTestId.Root}>
      <HudPanel title={t("title")}>
        {ordered.length === 0 ? (
          <Typography
            mono
            data-testid={ChatTasksPanelTestId.Empty}
            size="xs"
            type="note"
            variant="tertiary"
          >
            {t("empty")}
          </Typography>
        ) : (
          <Container maxHeight="calc(100vh - 220px)" overflowY="auto">
            <Stack data-testid={ChatTasksPanelTestId.List} gap="100">
              {ordered.map((r) => {
                const canExpand = EXPANDABLE_KINDS.has(r.kind);
                const expanded = canExpand && expandedRunId === r.runId;
                return (
                  <Stack data-testid={ChatTasksPanelTestId.Row} gap="100" key={r.runId}>
                    <ChatTaskRow
                      avatar={runAvatar(r, avatarById)}
                      expandAria={canExpand ? t("toggleLog") : undefined}
                      expanded={canExpand ? expanded : undefined}
                      glyph={runGlyph(r, glyphById)}
                      onToggleExpand={
                        canExpand
                          ? () => setExpandedRunId((cur) => (cur === r.runId ? null : r.runId))
                          : undefined
                      }
                      openAria={t("openAria", { title: runTitle(r) })}
                      run={r}
                      stateLabel={tRuns(`state.${r.status}`)}
                    />
                    {expanded && (
                      // Bounded height + scroll: the narrow chat column keeps this
                      // an inline glance, not a full page — the ⌘K detail dialog
                      // (Phase 58) is still the deep-dive.
                      <Container
                        data-testid={ChatTasksPanelTestId.Expanded}
                        maxHeight="320px"
                        overflowY="auto"
                      >
                        {r.kind === "chain" ? (
                          <ChainStepsPanel run={r} />
                        ) : r.kind === "pipeline" ? (
                          <PipelineStageTimeline
                            currentStage={r.currentStage}
                            live={r.status === "running"}
                            owner={r.owner}
                            parked={r.parked}
                            pipelineRunId={r.runId}
                            stageRuns={r.stageRuns}
                          />
                        ) : (
                          <RunLogStream
                            linesLabel={(n) => tRuns("lines", { n })}
                            live={r.status === "running"}
                            liveLabel={tRuns("liveLog")}
                            logLabel={tRuns("log")}
                            pct={r.status === "done" ? 100 : r.pct}
                            runId={r.runId}
                            tone={runStateTone(r.status) ?? "accent"}
                          />
                        )}
                      </Container>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Container>
        )}
      </HudPanel>
    </Container>
  );
}
