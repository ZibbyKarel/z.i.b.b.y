"use client";

import {
  Container,
  Divider,
  Icon,
  type IconName,
  Panel,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
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
 * component only supplies the surrounding column chrome: a floating close
 * affordance pinned over the panel (Phase 122 — see `SubsystemDrawer`'s close
 * button for the same idiom) and, since the column (like the gutter) is hidden
 * below `lg`, a quiet footer fallback link to the full `/runs` page for a
 * narrower viewport.
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
          // reasoning), but the Panel itself no longer owns the scroll (contrast
          // with `SubsystemDrawer`, which does) — Phase 122 pins the close button
          // to the Panel's own top-right corner so it stays put while the body
          // scrolls under it, which only works if the Panel is the non-scrolling
          // frame: `overflow: hidden` clips it to `maxHeight`, `position:
          // relative` makes it the close button's containing block, and the
          // Container below owns its own `overflowY: auto` scroll region.
          // Computed values with no dedicated `Panel` prop, routed through its
          // `style` passthrough (sanctioned).
          style={{ maxHeight: "100%", overflow: "hidden", position: "relative" }}
        >
          {/* Floating close, pinned over the panel (same idiom as
          `SubsystemDrawer`'s close button) — a plain DS `Pressable` inside a
          `Container position="absolute"` pins cleanly here (no raw `<button>`
          fallback needed), unlike the drawer's hero band which needs the
          button to sit over an image/gradient. */}
          <Container position="absolute" right="12px" top="12px" zIndex={10}>
            <Pressable
              aria-label={t("closeDetail")}
              data-testid={ChatTaskDetailColumnTestId.Close}
              onClick={onClose}
            >
              <Icon name="x" size="sm" tone="faint" />
            </Pressable>
          </Container>
          <Container overflowY="auto" padding="200" style={{ height: "100%" }}>
            <Stack gap="200">
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
              <Divider />
              {/* Quiet footer escape (Phase 122) — replaces the old top-strip
              "otevřít celý běh" affordance that stacked a redundant header
              above RunDetail's own hero. */}
              <Stack align="center" as="footer" direction="row" justify="center">
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
              </Stack>
            </Stack>
          </Container>
        </Panel>
      </div>
    </div>
  );
}
