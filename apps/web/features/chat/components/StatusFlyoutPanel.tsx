"use client";

import { useEffect, useId, useRef } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { Container, Stack, StatusDot, Typography } from "@zibby/design-system";
import { Collection } from "../../../components/Collection/Collection";
import { useApprovalsQuery } from "../../approvals";
import { useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { runGlyph } from "../../runs/run";
import {
  type FlyoutSection,
  SECTION_META,
  STATUS_PILL_DOM_ID,
  WORKING_STATUSES,
} from "../statusFlyout";
import { FlyoutApprovalRow } from "./FlyoutApprovalRow";
import { FlyoutWorkRow } from "./FlyoutWorkRow";

export enum StatusFlyoutTestId {
  Root = "chat-status-flyout",
  Header = "chat-status-flyout-header",
  Body = "chat-status-flyout-body",
}

/** Stable DOM id the pill triggers point aria-controls at (and move focus into). */
export const STATUS_FLYOUT_PANEL_ID = "chat-status-flyout-panel";

/** Minimum breathing room kept between the panel and the viewport edge. */
const PANEL_VIEWPORT_GAP = 16;

export interface StatusFlyoutPanelProps {
  section: FlyoutSection;
  /** Pill root rect — the panel is centered under the PILL, not the segment. */
  anchorRect: DOMRect | null;
  /** Hovered segment rect — the scale-in animation grows from it. */
  originRect: DOMRect | null;
  /** Hover bridge: entering the panel cancels the shared pending close. */
  onMouseEnter: () => void;
  /** Hover bridge: leaving the panel arms the shared 200ms close grace. */
  onMouseLeave: () => void;
  /** Escape inside the panel: close now + restore focus to the trigger. */
  onRequestClose: () => void;
}

function SectionHeader({
  count,
  headerId,
  section,
}: {
  count: number;
  headerId: string;
  section: FlyoutSection;
}) {
  const meta = SECTION_META[section];
  const t = useTranslations("chat.statusPill.flyout");
  const title = section === "working" ? t("working.title") : t("waiting.title");
  return (
    <Container
      data-testid={StatusFlyoutTestId.Header}
      padding="150"
      style={{ background: meta.headerGradient, borderBottom: "1px solid var(--color-border)" }}
    >
      <Stack align="center" direction="row" gap="100" justify="between">
        <Stack align="center" direction="row" gap="100">
          <StatusDot pulse tone={meta.dotTone} />
          <Typography id={headerId} size="md" tone={meta.titleTone} type="note" weight="semibold">
            {title}
          </Typography>
        </Stack>
        <Typography mono size="xs" type="note" variant="tertiary">
          {count}
        </Typography>
      </Stack>
    </Container>
  );
}

function WorkingSection({ headerId }: { headerId: string }) {
  const { runs, isPending, isError, refetch } = useRunsQuery();
  const glyphById = useRunGlyphMap();
  const working = runs.filter((r) => WORKING_STATUSES.has(r.status));
  const t = useTranslations("chat.statusPill.flyout");
  return (
    <>
      <SectionHeader count={working.length} headerId={headerId} section="working" />
      <Container data-testid={StatusFlyoutTestId.Body} padding="150">
        <Collection
          cols={1}
          empty={{
            glyph: "run",
            title: t("working.emptyTitle"),
            description: t("working.emptyBody"),
          }}
          error={
            isError
              ? {
                  title: t("errorTitle"),
                  description: t("errorBody"),
                  retryLabel: t("retry"),
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          gap="100"
          items={working}
          lg={2}
          loading={isPending ? { label: t("loading") } : undefined}
          renderItem={(run) => (
            <FlyoutWorkRow glyph={runGlyph(run, glyphById)} key={run.runId} run={run} />
          )}
          sm={2}
        />
      </Container>
    </>
  );
}

function WaitingSection({ headerId }: { headerId: string }) {
  const query = useApprovalsQuery();
  const approvals = query.data ?? [];
  const t = useTranslations("chat.statusPill.flyout");
  return (
    <>
      <SectionHeader count={approvals.length} headerId={headerId} section="waiting" />
      <Container data-testid={StatusFlyoutTestId.Body} padding="150">
        <Collection
          cols={1}
          empty={{
            glyph: "ok",
            title: t("waiting.emptyTitle"),
            description: t("waiting.emptyBody"),
          }}
          error={
            query.isError
              ? {
                  title: t("errorTitle"),
                  description: t("errorBody"),
                  retryLabel: t("retry"),
                  onRetry: () => void query.refetch(),
                }
              : undefined
          }
          gap="100"
          items={approvals}
          lg={2}
          loading={query.isPending ? { label: t("loading") } : undefined}
          renderItem={(approval) => <FlyoutApprovalRow approval={approval} key={approval.id} />}
          sm={2}
        />
      </Container>
    </>
  );
}

/**
 * The status-pill flyout (design VcStatusPanelD): a SOLID elevated panel (not glass)
 * portalled to document.body — the /chat z-ladder + Phase-99 stacking trap forbid
 * in-tree nesting (Dropdown's portal precedent). Fixed-positioned centered under the
 * pill; scale-in from the hovered segment on mount ONLY (a section swap re-renders
 * this mounted panel and must not re-animate — the prototype's wasOpenRef guard
 * becomes "effect runs once" because the panel fully unmounts when closed).
 */
export function StatusFlyoutPanel({
  section,
  anchorRect,
  originRect,
  onMouseEnter,
  onMouseLeave,
  onRequestClose,
}: StatusFlyoutPanelProps) {
  const headerId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const meta = SECTION_META[section];
  // Centered under the pill by default, but clamped to the viewport — the pill sits
  // at the LEFT edge of the top bar, so a naive center would push wide panels (the
  // 720px waiting section) mostly off-screen. Mirrors CommandLine's mention-panel clamp.
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : meta.width;
  const left = anchorRect
    ? Math.round(
        Math.max(
          PANEL_VIEWPORT_GAP,
          Math.min(
            anchorRect.left + anchorRect.width / 2 - meta.width / 2,
            viewportWidth - meta.width - PANEL_VIEWPORT_GAP,
          ),
        ),
      )
    : 0;
  const top = anchorRect ? Math.round(anchorRect.bottom + 10) : 0;

  useEffect(() => {
    const el = rootRef.current;
    if (el == null) return;
    const originXPct = originRect
      ? Math.min(
          100,
          Math.max(0, ((originRect.left + originRect.width / 2 - left) / meta.width) * 100),
        )
      : 50;
    el.style.transformOrigin = `${originXPct}% 0%`;
    el.style.transition = "none";
    el.style.transform = "scale(0.08)";
    el.style.opacity = "0";
    el.getBoundingClientRect(); // flush styles so the transition below animates
    requestAnimationFrame(() => {
      el.style.transition = "transform .32s cubic-bezier(.2,.8,.2,1), opacity .2s ease";
      el.style.transform = "scale(1)";
      el.style.opacity = "1";
    });
    // Mount-only by design: swapping sections while open must not replay the scale-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onRequestClose();
    }
  };

  // Keyboard analogue of mouse-leave (spec §6.2: close only when focus lands on
  // something that is neither the PANEL nor the PILL). The panel is a React child
  // of the pill even though it portals to document.body, so React re-dispatches
  // these focus events up the component tree — both subtrees must be checked here.
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (
      next != null &&
      (rootRef.current?.contains(next) || next.closest(`#${STATUS_PILL_DOM_ID}`) != null)
    ) {
      return;
    }
    onMouseLeave();
  };

  // Live-verify regression (task-7-report.md): the panel and the pill's trigger
  // buttons are DISJOINT DOM subtrees (the panel portals to document.body), so
  // the browser gives no ordering guarantee between this mouseleave and the
  // OTHER trigger's pointerenter when the pointer moves straight from the panel
  // onto it — the close-grace timer can end up armed with nothing left to
  // cancel it. `relatedTarget` sidesteps the race entirely: it names the
  // element the pointer is entering as part of THIS SAME event, so — exactly
  // like `onBlur` above — skip the close outright when it lands back on the pill.
  const onMouseLeaveGuarded = (e: ReactMouseEvent<HTMLElement>) => {
    const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (
      next != null &&
      (rootRef.current?.contains(next) || next.closest(`#${STATUS_PILL_DOM_ID}`) != null)
    ) {
      return;
    }
    onMouseLeave();
  };

  return createPortal(
    <Container
      aria-labelledby={headerId}
      data-testid={StatusFlyoutTestId.Root}
      id={STATUS_FLYOUT_PANEL_ID}
      maxHeight="76vh"
      onBlur={onBlur}
      // Keyboard analogue of pointer-enter: focus arriving in the panel (the pill's
      // Enter/ArrowDown flow) must cancel the shared close grace, or the 200ms timer
      // armed by the pill's blur would silently unmount the panel under the user.
      onFocus={onMouseEnter}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeaveGuarded}
      overflowY="auto"
      position="fixed"
      ref={rootRef}
      role="dialog"
      style={{
        left,
        top,
        width: meta.width,
        background: "var(--color-elevated)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: `${meta.ringShadow}, var(--shadow-modal)`,
      }}
      tabIndex={-1}
      zIndex={60}
    >
      {section === "working" ? (
        <WorkingSection headerId={headerId} />
      ) : (
        <WaitingSection headerId={headerId} />
      )}
    </Container>,
    document.body,
  );
}
