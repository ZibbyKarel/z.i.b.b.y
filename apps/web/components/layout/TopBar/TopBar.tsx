import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import {
  ButtonGroup,
  Container,
  Divider,
  Icon,
  SearchBar,
  Spacer,
  Stack,
  Typography,
} from "@zibby/design-system"
import type { ButtonGroupOption } from "@zibby/design-system"
import type { ContextName } from "../../../domain"

export interface TopBarProps {
  context: ContextName
  onContextChange: (context: ContextName) => void
  breadcrumb: string
  walletSlot?: ReactNode
  onCommand?: () => void
}

export function TopBar({
  context,
  onContextChange,
  breadcrumb,
  walletSlot,
  onCommand,
}: TopBarProps) {
  const t = useTranslations()
  const tCtx = useTranslations("context")
  const contextOptions: ButtonGroupOption[] = [
    { id: "home", label: tCtx("home"), tone: "home" },
    { id: "work", label: tCtx("work"), tone: "work" },
  ]
  return (
    <Container as="header" position="relative" zIndex={20}>
      <Container height="64px" padding={["0", "300"]} position="relative">
        <Stack align="center" direction="row" gap="100" style={{ height: "100%" }}>
          <ButtonGroup
            ariaLabel={t("topbar.contextSwitcher")}
            onChange={(v) => onContextChange(v as ContextName)}
            options={contextOptions}
            value={context}
          />
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
  )
}
