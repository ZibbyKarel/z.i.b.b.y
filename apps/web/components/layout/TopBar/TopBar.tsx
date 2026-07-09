import { Button, Container, Divider, Icon, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { GlobalSearch } from "../GlobalSearch/GlobalSearch";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import { SelfFreshness } from "./SelfFreshness";

export enum TopBarTestId {
  RailToggle = "topbar-rail-toggle",
}

export interface TopBarProps {
  breadcrumb: string;
  walletSlot?: ReactNode;
  taskSlot?: ReactNode;
  chatSlot?: ReactNode;
  /** Current visibility of the right rail — controls the toggle's icon/label. */
  railHidden?: boolean;
  /** Present only when a right rail exists; renders the toggle button. */
  onToggleRail?: () => void;
}

export function TopBar({
  breadcrumb,
  walletSlot,
  taskSlot,
  chatSlot,
  railHidden,
  onToggleRail,
}: TopBarProps) {
  const t = useTranslations("topbar");
  return (
    <Container as="header" position="relative" zIndex={20}>
      <Container height="64px" padding={["0", "300"]} position="relative">
        <Stack align="center" direction="row" gap="100" style={{ height: "100%" }}>
          <Stack align="center" direction="row" gap="75">
            <Icon name="chevron" size="sm" tone="faint" />
            <Typography mono size="base" type="note" variant="secondary">
              {breadcrumb}
            </Typography>
          </Stack>
          {/* Search sits in flow (flex: 0 1 360px) so it can never overlap
              its neighbours — the absolute ⌘K collision was an audit finding. */}
          <Container minWidth="150px" style={{ flex: "0 1 360px", margin: "0 auto" }}>
            <GlobalSearch />
          </Container>
          {chatSlot}
          {taskSlot}
          <SelfFreshness />
          <LanguageSwitcher />
          {onToggleRail && (
            <Button
              aria-expanded={!railHidden}
              aria-label={railHidden ? t("showRail") : t("hideRail")}
              aria-pressed={!railHidden}
              data-testid={TopBarTestId.RailToggle}
              icon={!railHidden ? "expand" : "collapse"}
              intent="ghost"
              onClick={onToggleRail}
              size="sm"
            />
          )}
          <Divider orientation="vertical" />
          {walletSlot}
        </Stack>
      </Container>
      <Divider />
    </Container>
  );
}
