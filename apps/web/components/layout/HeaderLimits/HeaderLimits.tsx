"use client";

import {
  Card,
  Container,
  Stack,
  type SubNavLinkComponent,
  TextLink,
  Typography,
  UsagePanel,
  type UsagePanelItem,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
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

  return (
    <Container
      data-testid={HeaderLimitsTestId.Root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      position="relative"
    >
      <TextLink
        aria-label={title}
        data-testid={HeaderLimitsTestId.Trigger}
        href={BUDGETS_HREF}
        linkComponent={Link as SubNavLinkComponent}
      >
        <UsagePanel items={items} />
      </TextLink>
      {open && (
        <Container
          data-testid={HeaderLimitsTestId.Popover}
          position="absolute"
          right="0"
          top="100%"
          width="340px"
          zIndex={60}
        >
          <Card background="elevated" radius="lg" shadow="dropdown">
            <Container padding="200">
              <Stack gap="150">
                <Typography data-testid={HeaderLimitsTestId.Title} type="label">
                  {title}
                </Typography>
                <BudgetsWidget onEmptyChange={noop} />
              </Stack>
            </Container>
          </Card>
        </Container>
      )}
    </Container>
  );
}
