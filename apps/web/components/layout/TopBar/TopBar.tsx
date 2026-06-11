import {
  Container,
  Divider,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import { GlobalSearch } from "../GlobalSearch/GlobalSearch";

export interface TopBarProps {
  breadcrumb: string;
  walletSlot?: ReactNode;
  taskSlot?: ReactNode;
  voiceSlot?: ReactNode;
}

export function TopBar({ breadcrumb, walletSlot, taskSlot, voiceSlot }: TopBarProps) {
  return (
    <Container as="header" position="relative" zIndex={20}>
      <Container height="64px" padding={["0", "300"]} position="relative">
        <Stack
          align="center"
          direction="row"
          gap="100"

          style={{ height: "100%" }}
        >
          <Stack align="center" direction="row" gap="75">
            <Icon name="chevron" size="sm" tone="faint" />
            <Typography mono size="base" type="note" variant="secondary">
              {breadcrumb}
            </Typography>
          </Stack>
          {/* Search sits in flow (flex: 0 1 360px) so it can never overlap
              its neighbours — the absolute ⌘K collision was an audit finding. */}
          <Container
            minW0

            style={{ flex: "0 1 360px", minWidth: 150, margin: "0 auto" }}
          >
            <GlobalSearch />
          </Container>
          {taskSlot}
          {voiceSlot}
          <LanguageSwitcher />
          <Divider orientation="vertical" />
          {walletSlot}
        </Stack>
      </Container>
      <Divider />
    </Container>
  );
}
