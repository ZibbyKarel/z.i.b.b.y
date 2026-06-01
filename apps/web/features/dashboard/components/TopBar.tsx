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
      <Container padding={["0", "300"]} height="64px">
        <Stack direction="row" align="center" gap="100" style={{ height: "100%" }}>
          <ButtonGroup
            options={CONTEXT_OPTIONS}
            value={context}
            onChange={(v) => onContextChange(v as ContextName)}
            ariaLabel="Přepínač kontextu"
          />
          <Stack direction="row" align="center" gap="75">
            <Icon name="chevron" size="sm" tone="faint" />
            <Typography type="note" mono size="base" variant="secondary">
              {breadcrumb}
            </Typography>
          </Stack>
          <Spacer />
          <Button
            intent="ghost"
            size="sm"
            icon="search"
            onClick={onCommand}
            title="Příkaz nebo skill (⌘K)"
            aria-label="Příkaz nebo skill"
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
