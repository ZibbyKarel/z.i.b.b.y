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
  useOverlayStack,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import { RunDetail } from "../../runs/components/RunDetail";
import { type RunView, runTitle } from "../../runs/run";

// Same idiom the DS `Dialog` and `SubsystemDrawer` use for their own focus
// traps — duplicated here rather than imported/shared, matching the
// established precedent in both of those files.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export enum ChatTaskDetailColumnTestId {
  Root = "chat-task-detail-column",
  Panel = "chat-task-detail-panel",
  Close = "chat-task-detail-close",
  OpenFull = "chat-task-detail-open-full",
}

/**
 * The modal's own lifecycle, independent of the `open`/mounted question (the
 * parent controls mounting via `{selectedRun && <ChatTaskDetailColumn .../>}`
 * — this only tracks the animation state within that mounted lifetime).
 * Same idiom as `SubsystemDrawerPhase` (phase 125).
 */
export type ChatTaskDetailPhase = "entering" | "open" | "closing";

export const PANEL_ENTER_MS = 220;
export const PANEL_EXIT_MS = 140;
export const BACKDROP_ENTER_MS = 180;
export const BACKDROP_EXIT_MS = 140;
const PANEL_EASE_ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";
const MODAL_WIDTH = "800px";

/**
 * The backdrop's fade — same both directions except duration/easing: 180ms
 * ease-out opening, 140ms ease-in closing (a plain reverse, no extra blur
 * ramp — Velín-D design spec, phase 126, identical values to `SubsystemDrawer`).
 */
export function backdropStyle(phase: ChatTaskDetailPhase): CSSProperties {
  const open = phase === "open";
  const duration = phase === "closing" ? BACKDROP_EXIT_MS : BACKDROP_ENTER_MS;
  const easing = phase === "closing" ? "ease-in" : "ease-out";
  return {
    background: "rgba(11, 14, 19, 0.55)",
    backdropFilter: "blur(14px) saturate(140%)",
    opacity: open ? 1 : 0,
    transition: `opacity ${duration}ms ${easing}`,
  };
}

/**
 * The panel's entrance/exit: fade + scale(0.96→1) + translateY(8px→0), 220ms
 * overshoot-free ease-out opening, mirrored 140ms ease-in closing. Under
 * `prefers-reduced-motion` the `transform` half is dropped entirely.
 */
export function panelTransitionStyle(
  phase: ChatTaskDetailPhase,
  reducedMotion: boolean,
): CSSProperties {
  const open = phase === "open";
  const duration = phase === "closing" ? PANEL_EXIT_MS : PANEL_ENTER_MS;
  const easing = phase === "closing" ? "ease-in" : PANEL_EASE_ENTER;
  const properties = reducedMotion ? ["opacity"] : ["opacity", "transform"];
  return {
    opacity: open ? 1 : 0,
    transform: reducedMotion
      ? undefined
      : open
        ? "scale(1) translateY(0)"
        : "scale(0.96) translateY(8px)",
    transition: properties.map((property) => `${property} ${duration}ms ${easing}`).join(", "),
  };
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
 * The chat screen's task detail (Phase 100, frame Phase 122, modal Phase 126):
 * a centered modal over the whole Velín canvas, opened from a row in the left
 * tasks gutter (`ChatTasksPanel`). Was a docked column immediately right of the
 * gutter through Phase 122 (no backdrop, gutter stayed interactive beside it);
 * now the same true-modal treatment `SubsystemDrawer` got in Phase 125 — see
 * that component and `docs/superpowers/specs/2026-07-17-task-detail-modal-design.md`.
 * Reuses {@link RunDetail} verbatim as the body; this component only supplies
 * the surrounding modal chrome (backdrop, entrance/exit animation, floating
 * close, footer "open full page" escape).
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
  const panelRef = useRef<HTMLDivElement>(null);

  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<ChatTaskDetailPhase>("entering");
  const closingRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flips "entering" → "open" right after mount — same idiom and same
  // `react-hooks/set-state-in-effect` justification as `SubsystemDrawer`
  // (phase 125): a `requestAnimationFrame` deferral would desync from
  // `renderWithProviders`' synchronous `act()` flush in tests.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("open");
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Any close trigger (backdrop click, header close button) calls this
  // instead of `onClose` directly: it plays the exit transition, THEN calls
  // the real `onClose` prop once it's done.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    closeTimeoutRef.current = setTimeout(onClose, PANEL_EXIT_MS);
  }, [onClose]);

  // Shares the DS `Dialog`'s overlay stack (the same one `SubsystemDrawer`
  // uses): `true` for this component's whole mounted lifetime, including the
  // `"closing"` phase, since the parent doesn't unmount it until
  // `requestClose`'s deferred `onClose` fires — scroll must stay locked
  // through the exit animation too.
  const { isTopmost } = useOverlayStack(true);

  // Escape closes; Tab/Shift+Tab cycles focus within the panel. Both are
  // no-ops when another overlay (a nested DS `Dialog`, etc.) is topmost.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = panelRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose, isTopmost]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <Container
      bottom="0"
      data-testid={ChatTaskDetailColumnTestId.Root}
      left="0"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      padding="200"
      position="fixed"
      right="0"
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        ...backdropStyle(phase),
      }}
      top="0"
      zIndex={40}
    >
      <Panel
        elevated
        aria-label={t("detailAriaLabel", { title: runTitle(run) })}
        data-testid={ChatTaskDetailColumnTestId.Panel}
        ref={panelRef}
        role="region"
        style={{
          maxHeight: "100%",
          maxWidth: "calc(100vw - 32px)",
          overflow: "hidden",
          position: "relative",
          width: MODAL_WIDTH,
          ...panelTransitionStyle(phase, reducedMotion),
        }}
        tabIndex={-1}
      >
        <Container position="absolute" right="12px" top="12px" zIndex={10}>
          <Pressable
            aria-label={t("closeDetail")}
            data-testid={ChatTaskDetailColumnTestId.Close}
            onClick={requestClose}
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
            <Stack align="center" as="footer" direction="row" justify="center">
              <Pressable
                data-testid={ChatTaskDetailColumnTestId.OpenFull}
                // F8d: `/runs` is deleted — `/archiv` (F2) is the surviving archive.
                onClick={() => router.push(`/archiv?run=${run.runId}` as Route)}
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
    </Container>
  );
}
