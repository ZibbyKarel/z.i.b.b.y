import {
  Container,
  Divider,
  Icon,
  Spacer,
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
          justify="between"
           
          style={{ height: "100%" }}
        >
          <Stack align="center" direction="row" gap="75">
            <Icon name="chevron" size="sm" tone="faint" />
            <Typography mono size="base" type="note" variant="secondary">
              {breadcrumb}
            </Typography>
          </Stack>
          <Spacer />
          {walletSlot}
          {taskSlot}
          {voiceSlot}
          <LanguageSwitcher />
        </Stack>

        <Container
          left="50%"
          maxWidth="40vw"
          position="absolute"

          style={{ transform: "translate(-50%, -50%)" }}
          top="50%"
          width="360px"
        >
          <GlobalSearch />
        </Container>
      </Container>
      <Divider />
    </Container>
  );
}
