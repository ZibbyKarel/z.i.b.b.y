import type { ReactNode } from "react"
import {
  Button,
  ButtonGroup,
  Container,
  Divider,
  Icon,
  Kbd,
  Spacer,
  Stack,
  Typography,
} from "@zibby/design-system"
import type { ButtonGroupOption } from "@zibby/design-system"
import type { ContextName } from "../../../domain"

const CONTEXT_OPTIONS: ButtonGroupOption[] = [
  { id: "home", label: "home", tone: "home" },
  { id: "work", label: "work", tone: "work" },
]

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
  return (
    <Container as="header" position="relative" zIndex={20}>
      <Container height="64px" padding={["0", "300"]}>
        <Stack align="center" direction="row" gap="100" style={{ height: "100%" }}>
          <ButtonGroup
            ariaLabel="Přepínač kontextu"
            onChange={(v) => onContextChange(v as ContextName)}
            options={CONTEXT_OPTIONS}
            value={context}
          />
          <Stack align="center" direction="row" gap="75">
            <Icon name="chevron" size="sm" tone="faint" />
            <Typography mono size="base" type="note" variant="secondary">
              {breadcrumb}
            </Typography>
          </Stack>
          <Spacer />
          <Button
            aria-label="Příkaz nebo skill"
            icon="search"
            intent="ghost"
            onClick={onCommand}
            size="sm"
            title="Příkaz nebo skill (⌘K)"
          >
            <Kbd>⌘K</Kbd>
          </Button>
          {walletSlot}
        </Stack>
      </Container>
      <Divider />
    </Container>
  )
}
