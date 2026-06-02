import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Container,
  Divider,
  Icon,
  SearchBar,
  Spacer,
  Stack,
  Typography,
} from "@zibby/design-system";

export interface TopBarProps {
  breadcrumb: string;
  walletSlot?: ReactNode;
  onCommand?: () => void;
}

export function TopBar({ breadcrumb, walletSlot, onCommand }: TopBarProps) {
  const t = useTranslations();
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
          <Spacer />
          {walletSlot}
        </Stack>

        {/* Centered command / search bar — the primary action in the top bar. */}
        <Container
          left="50%"
          maxWidth="40vw"
          position="absolute"
          style={{ top: "50%", transform: "translate(-50%, -50%)" }}
          width="360px"
        >
          <SearchBar
            ariaLabel={t("topbar.commandAriaLabel")}
            onClick={onCommand}
            placeholder={t("topbar.commandPlaceholder")}
            shortcut="⌘K"
            title={t("topbar.commandHint")}
          />
        </Container>
      </Container>
      <Divider />
    </Container>
  );
}
