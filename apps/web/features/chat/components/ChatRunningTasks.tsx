"use client";

import { Container, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useActiveProject } from "../../projects";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { type FeedStatus, runAvatar, runGlyph, runTitle } from "../../runs/run";
import { ChatRunningTaskRow } from "./ChatRunningTaskRow";

export enum ChatRunningTasksTestId {
  Root = "chat-running-tasks",
  List = "chat-running-tasks-list",
  Empty = "chat-running-tasks-empty",
}

/**
 * The states that count as "aktivní / běží" for the rail: a run actively
 * progressing (`running`), one accepted and spawning (`pending`), or one paused on
 * the operator's decision at the gate (`awaiting-approval`). These are exactly the
 * three the run-state map marks as live (`pulse: true`) — a still-`scheduled`,
 * `queued`, `held` or terminal run is not "running now" and stays off the rail (it
 * lives on the full runs feed instead).
 */
const ACTIVE_STATES = new Set<FeedStatus>(["running", "pending", "awaiting-approval"]);

/**
 * The chat page's left "Běží" rail: a live list of the currently active/running
 * runs (incl. ones launched from the HUD), so the operator sees what's in flight
 * while chatting. Distinct from the removed activity LOG (Phase 39) — this is the
 * running set, not history.
 *
 * Reads the STABLE unified runs feed ({@link useRunsQuery}, kept fresh by the
 * shared SSE bus) rather than the chat data-layer, and honors the same
 * active-project scope the chat top bar switches (Phase 24/33): a real project
 * shows only its own runs, "Bez projektu" only unattributed ones — the same
 * client-side filter the runs screen uses. A slim always-present rail (with a quiet
 * empty hint) reads better than a panel that pops in and out, so it renders even
 * when nothing is running.
 */
export function ChatRunningTasks() {
  const t = useTranslations("chat.runningTasks");
  const tRuns = useTranslations("runs");
  const { runs } = useRunsQuery();
  const { activeProjectId } = useActiveProject();
  const glyphById = useRunGlyphMap();
  const avatarById = useRunAvatarMap();

  const scoped =
    activeProjectId === null
      ? runs.filter((r) => !r.projectId)
      : runs.filter((r) => r.projectId === activeProjectId);
  const active = scoped.filter((r) => ACTIVE_STATES.has(r.status));

  return (
    <Container data-testid={ChatRunningTasksTestId.Root}>
      <HudPanel title={t("title")}>
        {active.length === 0 ? (
          <Typography
            mono
            data-testid={ChatRunningTasksTestId.Empty}
            size="xs"
            type="note"
            variant="tertiary"
          >
            {t("empty")}
          </Typography>
        ) : (
          <Container maxHeight="calc(100vh - 220px)" overflowY="auto">
            <Stack data-testid={ChatRunningTasksTestId.List} gap="100">
              {active.map((r) => (
                <ChatRunningTaskRow
                  avatar={runAvatar(r, avatarById)}
                  glyph={runGlyph(r, glyphById)}
                  key={r.runId}
                  openAria={t("openAria", { title: runTitle(r) })}
                  run={r}
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
