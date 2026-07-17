"use client";

import { Container, Icon, Pressable, Stack, StatusDot, Typography, cn } from "@zibby/design-system";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { type FeedStatus, runAvatar, runGlyph, runTitle } from "../../runs/run";
import { RUN_STATUS_GROUPS } from "../../runs/statusGroups";
import { ChatTaskRow } from "./ChatTaskRow";

export enum ChatTasksPanelTestId {
  Root = "chat-tasks-panel",
  List = "chat-tasks-panel-list",
  Empty = "chat-tasks-panel-empty",
  /** The header's localized title — selected by testid rather than asserting the
   * translated copy itself, since the `chat.tasks.title` string is Task 7's to
   * change (cs `"Tasky"` → `"Běžící úlohy"`). */
  Title = "chat-tasks-panel-title",
  /** Quiet "no active tasks" hint shown when the feed has archived tasks but
   * nothing active — distinct from {@link Empty}, which covers "no tasks at all". */
  ActiveEmpty = "chat-tasks-panel-active-empty",
  /** The "Archiv · N" toggle row below the active list (Phase 123). */
  ArchiveToggle = "chat-tasks-panel-archive-toggle",
  /** The scrollable column of archived cards, rendered only while expanded. */
  ArchiveList = "chat-tasks-panel-archive-list",
}

/**
 * Statuses that read as settled — finished or otherwise done progressing on
 * their own — and so belong behind the "Archiv" toggle rather than the live
 * gutter (Phase 123). Deliberately NOT the `done`/`error`/`parked` groups of
 * {@link RUN_STATUS_GROUPS} taken wholesale: `paused-limit` sits in that
 * module's `error` bucket (a rate-limit pause reads as a failure for the runs
 * screen's grouping) but is a MID-RUN pause that auto-resumes once the limit
 * clears, so it stays in the active gutter here — the one deliberate
 * exception to "derive from RUN_STATUS_GROUPS".
 */
const ARCHIVED_STATES = new Set<FeedStatus>(["done", "error", "interrupted", "parked"]);

/** Whether `status` belongs behind the Archiv toggle rather than the active gutter. */
function isArchived(status: FeedStatus): boolean {
  return ARCHIVED_STATES.has(status);
}

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

export interface ChatTasksPanelProps {
  /** The run whose detail is currently open in the inline column beside this panel
   * (owned by `ChatScreen`, which mounts that column outside the panel's own 300px
   * gutter) — read back into the matching row's selected state (Phase 100). `null`
   * when no row is selected. */
  selectedRunId: string | null;
  /** Fired with a row's `runId` on click — `ChatScreen` decides whether this opens
   * the inline detail or (re-clicking the already-selected row) closes it. */
  onSelectRun: (runId: string) => void;
}

/**
 * The chat page's left tasks gutter: EVERY task across EVERY project (Phase 57,
 * generalizing Phase 44's running-only rail; Phase 108 dropped the Phase 24
 * project scope this used to honor), so the chat is a full task view — not
 * just a "what's running now" strip. Ordered so live tasks (running / spawning /
 * awaiting-approval) surface first, then waiting/scheduled, then finished — a stable
 * sort by {@link taskRank} preserving the feed's own (newest-first) order within each
 * bucket. Clicking a row selects it; `ChatScreen` renders the run's detail inline in a
 * column beside this panel rather than navigating to `/runs` (Phase 100 — replaces the
 * Phase 92 per-row expand chevron, which is now redundant: the inline detail already
 * covers everything the chevron's per-kind live view showed, plus the full picture).
 *
 * Phase 121 (Velín-D `VcTaskRail` alignment): TRANSPARENT gutter, not a boxed panel —
 * there is no wrapping `HudPanel`/`Card` any more. Each {@link ChatTaskRow} already
 * renders its own design-close floating glass card (edge tone, living glow, avatar,
 * meta strip, progress meter); this component only supplies a minimal live-dot +
 * count header and the scrolling column, so the orb map behind stays visible (and
 * clickable) through the gutter's own empty space.
 *
 * Reads the STABLE unified runs feed ({@link useRunsQuery}, kept fresh by the shared
 * SSE bus) rather than the chat data-layer. Phase 108: there is no global project
 * scope any more — every project's tasks show here at once (the Phase 24/33
 * top-bar scope this used to honor is gone). Scrollable, with a quiet empty hint
 * when there are no tasks at all.
 *
 * Phase 123: the header's "Běžící úlohy" (running tasks) title is now honest — the
 * gutter shows only {@link isArchived}-false ("active") tasks; finished/settled
 * tasks (`done`/`error`/`interrupted`/`parked`) move behind a collapsed "Archiv"
 * toggle below the active list, expanding into the same scroll region.
 */
export function ChatTasksPanel({ selectedRunId, onSelectRun }: ChatTasksPanelProps) {
  const t = useTranslations("chat.tasks");
  const tRuns = useTranslations("runs");
  const { runs } = useRunsQuery();
  const glyphById = useRunGlyphMap();
  const avatarById = useRunAvatarMap();
  // Collapsed by default (Phase 123) — the archive is a deliberate look-back,
  // not part of the at-a-glance gutter.
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Active tasks only, live first then waiting/scheduled — `Array.prototype.sort`
  // is stable, so the feed's own newest-first order is kept within each rank.
  const active = runs
    .filter((r) => !isArchived(r.status))
    .sort((a, b) => taskRank(a.status) - taskRank(b.status));
  // Archived tasks keep the feed's own (newest-first) order untouched — there is
  // no "live" rank to sort by once a task has settled.
  const archived = runs.filter((r) => isArchived(r.status));

  const renderRow = (r: (typeof runs)[number], index: number) => (
    <ChatTaskRow
      avatar={runAvatar(r, avatarById)}
      glyph={runGlyph(r, glyphById)}
      index={index}
      key={r.runId}
      onSelect={onSelectRun}
      openAria={t("openAria", { title: runTitle(r) })}
      run={r}
      selected={selectedRunId === r.runId}
      stateLabel={tRuns(`state.${r.status}`)}
    />
  );

  return (
    // No fixed `height` here (only the list below caps with `maxHeight`) — this
    // root sizes to its own content, so the `pointer-events-auto` wrapper `ChatScreen`
    // mounts it in hugs the header + cards rather than catching clicks over the
    // gutter's empty track (Phase 121).
    <Container data-testid={ChatTasksPanelTestId.Root} padding={["0", "100", "0", "0"]}>
      <Stack gap="150">
        <Stack align="center" direction="row" gap="100" justify="between">
          <Stack align="center" direction="row" gap="75">
            <StatusDot pulse size="75" tone="run" />
            <Typography data-testid={ChatTasksPanelTestId.Title} type="label">
              {t("title")}
            </Typography>
          </Stack>
          <Typography mono type="note" variant="secondary">
            {active.length}
          </Typography>
        </Stack>
        {active.length === 0 && archived.length === 0 ? (
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
          // Active list, the Archiv toggle, and (when expanded) the archived
          // cards all share ONE scroll region — the archive expanding just adds
          // rows to this column rather than opening a second scroller, so the
          // gutter's `maxHeight` band is never exceeded (Phase 123).
          <Container maxHeight="calc(100vh - 220px)" overflowY="auto">
            <Stack gap="150">
              {active.length > 0 ? (
                <Stack data-testid={ChatTasksPanelTestId.List} gap="100">
                  {active.map(renderRow)}
                </Stack>
              ) : (
                <Typography
                  mono
                  data-testid={ChatTasksPanelTestId.ActiveEmpty}
                  size="xs"
                  type="note"
                  variant="tertiary"
                >
                  {t("activeEmpty")}
                </Typography>
              )}
              {archived.length > 0 && (
                <Stack gap="100">
                  <Stack grow>
                    <Pressable
                      aria-expanded={archiveOpen}
                      data-testid={ChatTasksPanelTestId.ArchiveToggle}
                      onClick={() => setArchiveOpen((v) => !v)}
                    >
                      <Stack align="center" direction="row" gap="75" justify="between">
                        <Stack align="center" direction="row" gap="75">
                          <Icon name="doc" size="xs" tone="faint" />
                          <Typography mono size="xs" type="note" variant="tertiary">
                            {t("archive")} · {archived.length}
                          </Typography>
                        </Stack>
                        <Icon
                          className={cn(
                            "transition-transform duration-150",
                            archiveOpen && "rotate-90",
                          )}
                          name="chevron"
                          size="xs"
                          tone="faint"
                        />
                      </Stack>
                    </Pressable>
                  </Stack>
                  {archiveOpen && (
                    <Stack data-testid={ChatTasksPanelTestId.ArchiveList} gap="100">
                      {archived.map(renderRow)}
                    </Stack>
                  )}
                </Stack>
              )}
            </Stack>
          </Container>
        )}
      </Stack>
    </Container>
  );
}
