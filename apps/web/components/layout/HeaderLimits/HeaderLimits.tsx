"use client";

import {
  Container,
  MenuSurface,
  Stack,
  type SubNavLinkComponent,
  TextLink,
  Typography,
  UsagePanel,
  type UsagePanelItem,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BudgetsWidget } from "../../../features/bridge/widgets/BudgetsWidget";

export enum HeaderLimitsTestId {
  Root = "header-limits-root",
  Trigger = "header-limits-trigger",
  Popover = "header-limits-popover",
  Title = "header-limits-title",
}

export interface HeaderLimitsProps {
  items: readonly UsagePanelItem[];
}

const BUDGETS_HREF = "/governance/budgets";
const POPOVER_WIDTH = 340;
const POPOVER_GAP = 0; // no gap: the pointer must not leave the hover region between trigger and popover
const VIEWPORT_MARGIN = 8;
const noop = () => {};

/**
 * The top bar's limits: the `UsagePanel` rings as a link to Budgets & limits, with the
 * bridge "Budgets & limits" widget in a hover/focus popover. Kept app-local (not a DS
 * hovercard): the DS `Tooltip` is a pointer-less hint and can't host the widget's link rows.
 */
export function HeaderLimits({ items }: HeaderLimitsProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const title = t("bridge.widget.budgets.label");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updateRect = useCallback(() => {
    if (rootRef.current) setRect(rootRef.current.getBoundingClientRect());
  }, []);

  // The header sits in an `overflow-x: auto` wrapper that clips everything below its
  // 56px row, so the popover is portaled to <body> and positioned `fixed` from the
  // trigger's rect (same mechanism as MenuButton), kept fresh on scroll/resize.
  useEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open, updateRect]);

  // Only evaluated while open (client-side), so `window` is safe.
  const width = () => Math.min(POPOVER_WIDTH, window.innerWidth - 2 * VIEWPORT_MARGIN);

  return (
    <Container
      data-testid={HeaderLimitsTestId.Root}
      onBlur={(e) => {
        const next = e.relatedTarget;
        // The popover is portaled, so it is not a DOM child of the root.
        if (
          !(
            next instanceof Node &&
            (e.currentTarget.contains(next) || popoverRef.current?.contains(next))
          )
        )
          setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      position="relative"
      ref={rootRef}
    >
      <TextLink
        aria-label={title}
        data-testid={HeaderLimitsTestId.Trigger}
        href={BUDGETS_HREF}
        linkComponent={Link as SubNavLinkComponent}
      >
        <UsagePanel items={items} />
      </TextLink>
      {open &&
        rect &&
        createPortal(
          <MenuSurface
            data-testid={HeaderLimitsTestId.Popover}
            placement="fixed"
            ref={popoverRef}
            style={{
              top: rect.bottom + POPOVER_GAP,
              left: Math.max(
                VIEWPORT_MARGIN,
                Math.min(rect.right - width(), window.innerWidth - width() - VIEWPORT_MARGIN),
              ),
              width: width(),
              zIndex: 60,
            }}
          >
            <Container padding="200">
              <Stack gap="150">
                <Typography data-testid={HeaderLimitsTestId.Title} type="label">
                  {title}
                </Typography>
                <BudgetsWidget onEmptyChange={noop} />
              </Stack>
            </Container>
          </MenuSurface>,
          document.body,
        )}
    </Container>
  );
}
