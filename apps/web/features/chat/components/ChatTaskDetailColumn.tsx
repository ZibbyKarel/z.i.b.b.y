"use client";

import { Container, Icon, type IconName, Panel, Pressable, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { RunDetail } from "../../runs/components/RunDetail";
import { type RunView, runTitle } from "../../runs/run";

export enum ChatTaskDetailColumnTestId {
  Root = "chat-task-detail-column",
  Panel = "chat-task-detail-panel",
  Close = "chat-task-detail-close",
  OpenFull = "chat-task-detail-open-full",
}

export interface ChatTaskDetailColumnProps {
  run: RunView;
  glyph: IconName;
  avatar?: string;
  now: number;
  onStop: () => void;
  stopping: boolean;
  onDelete: () => void;
  deleting: boolean;
  onResume: () => void;
  resuming: boolean;
  /** Clears the selection — the column's own close button, or re-clicking the
   * already-selected row in {@link ChatTasksPanel}. */
  onClose: () => void;
}

/**
 * The chat screen's inline run detail (Phase 100): a fixed column immediately to
 * the right of the left tasks panel's 300px gutter, mounted only while a run is
 * selected — replaces the old `/runs?run=<id>` redirect a task-card click used to
 * fire. Reuses {@link RunDetail} verbatim (the same header/hero, approval + PR
 * gate, log stream / stage timeline / chain steps, stop/resume/delete); this
 * component only supplies the surrounding column chrome: a close affordance and,
 * since the column (like the gutter) is hidden below `lg`, a fallback link to the
 * full `/runs` page for a narrower viewport.
 *
 * Positioned the same way `SubsystemDrawer` is (Phase 84/99) — an outer
 * `pointer-events-none` wrapper pinned to the band between the top bar and the
 * composer, with a `pointer-events-auto` inner — but on the opposite side (left,
 * right after the gutter) so the two never fight over the same space.
 */
export function ChatTaskDetailColumn({
  run,
  glyph,
  avatar,
  now,
  onStop,
  stopping,
  onDelete,
  deleting,
  onResume,
  resuming,
  onClose,
}: ChatTaskDetailColumnProps) {
  const t = useTranslations("chat.tasks");
  const router = useRouter();

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-[316px] right-4 z-20 hidden w-auto flex-col p-4 lg:flex"
      data-testid={ChatTaskDetailColumnTestId.Root}
    >
      <div className="pointer-events-auto flex h-full w-full flex-col">
        <Panel
          elevated
          aria-label={t("detailAriaLabel", { title: runTitle(run) })}
          data-testid={ChatTaskDetailColumnTestId.Panel}
          role="region"
          // Bounded to this wrapper's own band (see `SubsystemDrawer`'s identical
          // reasoning) with its own scroll — a computed value with no dedicated
          // `Panel` prop, routed through its `style` passthrough (sanctioned).
          style={{ maxHeight: "100%", overflowY: "auto" }}
        >
          <Container padding="200">
            <Stack gap="200">
              <Stack align="center" direction="row" gap="100" justify="between">
                <Pressable
                  data-testid={ChatTaskDetailColumnTestId.OpenFull}
                  onClick={() => router.push(`/runs?run=${run.runId}` as Route)}
                >
                  <Stack align="center" direction="row" gap="50">
                    <Icon name="expand" size="xs" tone="faint" />
                    <Typography mono size="2xs" type="note" variant="tertiary">
                      {t("openFull")}
                    </Typography>
                  </Stack>
                </Pressable>
                <Pressable
                  aria-label={t("closeDetail")}
                  data-testid={ChatTaskDetailColumnTestId.Close}
                  onClick={onClose}
                >
                  <Icon name="x" size="sm" tone="faint" />
                </Pressable>
              </Stack>
              <RunDetail
                avatar={avatar}
                deleting={deleting}
                glyph={glyph}
                now={now}
                onDelete={onDelete}
                onResume={onResume}
                onStop={onStop}
                resuming={resuming}
                run={run}
                stopping={stopping}
              />
            </Stack>
          </Container>
        </Panel>
      </div>
    </div>
  );
}
