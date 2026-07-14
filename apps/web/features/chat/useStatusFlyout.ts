"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CLOSE_GRACE_MS, type FlyoutSection } from "./statusFlyout";

export interface UseStatusFlyout {
  /** The open section, or null when closed. */
  activeSection: FlyoutSection | null;
  open: boolean;
  /** Open (or swap to) a section immediately; cancels any pending close. */
  openTo: (section: FlyoutSection) => void;
  /** Arm the shared 200ms close grace (mouse/focus left pill OR panel). */
  scheduleClose: () => void;
  /** Cancel a pending close (mouse/focus entered pill OR panel). */
  cancelClose: () => void;
  /** Close now (Escape). */
  close: () => void;
}

/**
 * The flyout's hover/keyboard state machine (design VcStatusLineD): instant open,
 * instant section-swap, one shared close timer across pill + panel so moving the
 * pointer between them never closes — only leaving both for CLOSE_GRACE_MS does.
 */
export function useStatusFlyout(): UseStatusFlyout {
  const [activeSection, setActiveSection] = useState<FlyoutSection | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openTo = useCallback(
    (section: FlyoutSection) => {
      cancelClose();
      setActiveSection(section);
    },
    [cancelClose],
  );

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setActiveSection(null), CLOSE_GRACE_MS);
  }, [cancelClose]);

  const close = useCallback(() => {
    cancelClose();
    setActiveSection(null);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return { activeSection, open: activeSection != null, openTo, scheduleClose, cancelClose, close };
}
