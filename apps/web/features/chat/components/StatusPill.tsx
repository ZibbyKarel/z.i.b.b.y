"use client";

import { useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";
import { type FlyoutSection, STATUS_PILL_DOM_ID } from "../statusFlyout";
import { useStatusFlyout } from "../useStatusFlyout";
import { STATUS_FLYOUT_PANEL_ID, StatusFlyoutPanel } from "./StatusFlyoutPanel";

export enum StatusPillTestId {
  Root = "chat-status-pill",
  Working = "chat-status-pill-working",
  Report = "chat-status-pill-report",
  Waiting = "chat-status-pill-waiting",
}

/** Per-section trigger chrome (design: hovered/active segment tints in its hue). */
const TRIGGER_CLASS: Record<FlyoutSection, string> = {
  working:
    "rounded-full px-2 py-0.5 transition-colors hover:bg-run/15 aria-expanded:bg-run/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-run",
  waiting:
    "rounded-full px-2 py-0.5 transition-colors hover:bg-warn/15 aria-expanded:bg-warn/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-warn",
};

/**
 * The top-bar live status pill — subsystem state counts, now also the flyout host
 * (Velín-D phase 3a): the working/waiting segments are hover+keyboard triggers for
 * the portalled StatusFlyoutPanel; the report segment stays a plain count (operator:
 * reports section omitted this phase). Raw <button> triggers are the sanctioned
 * bespoke-control pattern; Tailwind classes only, no inline style.
 */
export function StatusPill() {
  const t = useTranslations("chat");
  const { data } = useSubsystemsQuery();
  const subsystems = data ?? [];
  const flyout = useStatusFlyout();
  const rootRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const suppressFocusOpenRef = useRef(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  const working = subsystems.filter((s) => s.state === "running").length;
  const report = subsystems.filter((s) => s.state === "report").length;
  const waiting = subsystems.filter((s) => s.state === "waiting").length;

  const openSection = (section: FlyoutSection, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setAnchorRect(rootRef.current?.getBoundingClientRect() ?? null);
    setOriginRect(trigger.getBoundingClientRect());
    flyout.openTo(section);
  };

  const closeAndRestoreFocus = () => {
    flyout.close();
    const trigger = lastTriggerRef.current;
    // .focus() fires the trigger's onFocus synchronously — without this one-shot
    // guard, Escape-close would instantly reopen the panel. Arm it ONLY when focus
    // actually moves: if the trigger already holds focus (Escape pressed on the
    // trigger itself) no focus event fires, and a stale flag would swallow the
    // next genuine focus-open.
    if (trigger != null && document.activeElement !== trigger) {
      suppressFocusOpenRef.current = true;
      trigger.focus();
    }
  };

  const onTriggerFocus = (section: FlyoutSection) => (e: FocusEvent<HTMLButtonElement>) => {
    if (suppressFocusOpenRef.current) {
      suppressFocusOpenRef.current = false;
      return;
    }
    openSection(section, e.currentTarget);
  };

  const onTriggerPointerEnter = (section: FlyoutSection) => (e: PointerEvent<HTMLButtonElement>) => {
    openSection(section, e.currentTarget);
  };

  const onTriggerKeyDown = (section: FlyoutSection) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      closeAndRestoreFocus();
      return;
    }
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      openSection(section, e.currentTarget);
      // Move focus into the panel root (tabIndex=-1) once it has mounted.
      requestAnimationFrame(() => document.getElementById(STATUS_FLYOUT_PANEL_ID)?.focus());
    }
  };

  // Keyboard analogue of mouse-leave (spec §6.2: close only when focus lands on
  // something that is neither the PILL nor the PANEL). The portalled panel is a
  // React child of this div, so its focusout re-dispatches here too — focus moving
  // INTO the panel (the Enter/ArrowDown flow) must NOT arm the close grace.
  const onRootBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (
      next != null &&
      (rootRef.current?.contains(next) || next.closest(`#${STATUS_FLYOUT_PANEL_ID}`) != null)
    ) {
      return;
    }
    flyout.scheduleClose();
  };

  const trigger = (section: FlyoutSection, testId: string, label: ReactNode) => (
    <button
      aria-controls={STATUS_FLYOUT_PANEL_ID}
      aria-expanded={flyout.activeSection === section}
      aria-haspopup="dialog"
      className={TRIGGER_CLASS[section]}
      data-testid={testId}
      onFocus={onTriggerFocus(section)}
      onKeyDown={onTriggerKeyDown(section)}
      onPointerEnter={onTriggerPointerEnter(section)}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div
      className="rounded-full border border-border px-[14px] py-[6px]"
      data-testid={StatusPillTestId.Root}
      id={STATUS_PILL_DOM_ID}
      onBlur={onRootBlur}
      onMouseEnter={flyout.cancelClose}
      onMouseLeave={flyout.scheduleClose}
      ref={rootRef}
    >
      <Stack align="center" direction="row" gap="100">
        <StatusDot tone="ok" />
        <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
          {t("statusPill.nominal")}
        </Typography>
        {working > 0 &&
          trigger(
            "working",
            StatusPillTestId.Working,
            <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
              {t("statusPill.working", { n: working })}
            </Typography>,
          )}
        {report > 0 && (
          <Typography
            mono
            data-testid={StatusPillTestId.Report}
            size="xs"
            tone="warn"
            tracking="wide"
            type="note"
          >
            {t("statusPill.report", { n: report })}
          </Typography>
        )}
        {waiting > 0 &&
          trigger(
            "waiting",
            StatusPillTestId.Waiting,
            <Typography mono size="xs" tone="accent" tracking="wide" type="note">
              {t("statusPill.waiting", { n: waiting })}
            </Typography>,
          )}
      </Stack>
      {flyout.activeSection != null && (
        <StatusFlyoutPanel
          anchorRect={anchorRect}
          onMouseEnter={flyout.cancelClose}
          onMouseLeave={flyout.scheduleClose}
          onRequestClose={closeAndRestoreFocus}
          originRect={originRect}
          section={flyout.activeSection}
        />
      )}
    </div>
  );
}
