"use client";

import { Container, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useActiveProject } from "../../projects";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { type FeedStatus, runAvatar, runGlyph, runTitle } from "../../runs/run";
import { RUN_STATUS_GROUPS } from "../../runs/statusGroups";
import { ChatTaskRow } from "./ChatTaskRow";

export enum ChatTasksPanelTestId {
  Root = "chat-tasks-panel",
  List = "chat-tasks-panel-list",
  Empty = "chat-tasks-panel-empty",
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
 * The chat page's left tasks panel: EVERY task in the active-project scope (Phase 57,
 * generalizing Phase 44's running-only rail), so the chat is a full task view — not
 * just a "what's running now" strip. Ordered so live tasks (running / spawning /
 * awaiting-approval) surface first, then waiting/scheduled, then finished — a stable
 * sort by {@link taskRank} preserving the feed's own (newest-first) order within each
 * bucket. Clicking a row selects it; `ChatScreen` renders the run's detail inline in a
 * column beside this panel rather than navigating to `/runs` (Phase 100 — replaces the
 * Phase 92 per-row expand chevron, which is now redundant: the inline detail already
 * covers everything the chevron's per-kind live view showed, plus the full picture).
 *
 * Reads the STABLE unified runs feed ({@link useRunsQuery}, kept fresh by the shared
 * SSE bus) rather than the chat data-layer, and honors the same active-project scope
 * the chat top bar switches (Phase 24/33): a real project shows only its own runs,
 * "Bez projektu" only unattributed ones — the same client-side filter the runs screen
 * uses. Scrollable, with a quiet empty hint when the scope has no tasks at all.
 */
export function ChatTasksPanel({ selectedRunId, onSelectRun }: ChatTasksPanelProps) {
  const t = useTranslations("chat.tasks");
  const tRuns = useTranslations("runs");
  const { runs } = useRunsQuery();
  const { activeProjectId } = useActiveProject();
  const glyphById = useRunGlyphMap();
  const avatarById = useRunAvatarMap();

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
              {ordered.map((r) => (
                <ChatTaskRow
                  avatar={runAvatar(r, avatarById)}
                  glyph={runGlyph(r, glyphById)}
                  key={r.runId}
                  onSelect={onSelectRun}
                  openAria={t("openAria", { title: runTitle(r) })}
                  run={r}
                  selected={selectedRunId === r.runId}
                  stateLabel={tRuns(`state.${r.status}`)}
                />
              ))}
            </Stack>
          </Container>
        )}
      </HudPanel>
    </Container>
  );
}
