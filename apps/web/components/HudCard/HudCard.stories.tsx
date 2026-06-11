import type { Meta, StoryObj } from "@storybook/react"
import { Button, Chip, Container, Icon } from "@zibby/design-system"
import { HudCard } from "./HudCard"

const meta: Meta<typeof HudCard> = {
  title: "Dashboard/HudCard",
  component: HudCard,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container width="360px">
        <Story />
      </Container>
    ),
  ],
  args: {
    title: "reviewer",
    glyph: "bot",
    description: "Prochází diff a hlásí regresní rizika před mergem.",
  },
}
export default meta

type Story = StoryObj<typeof HudCard>

const badgeRows = [
  [
    <Chip key="model" tone="neutral">
      sonnet
    </Chip>,
    <Chip key="think" tone="neutral">
      ◇ medium
    </Chip>,
    <Chip key="usage" tone="accent">
      <Icon name="flow" size="xs" /> 3 pipelines
    </Chip>,
  ],
  [
    <Chip key="read" tone="neutral">
      read
    </Chip>,
    <Chip key="grep" tone="neutral">
      grep
    </Chip>,
  ],
]

const runAction = (
  <Container textAlign="right">
    <Button icon="play" intent="primary" size="sm">
      spustit
    </Button>
  </Container>
)

export const Default: Story = {
  args: { badges: badgeRows, actions: runAction, openLabel: "otevřít reviewer" },
}

export const Pinned: Story = {
  args: {
    badges: badgeRows,
    actions: runAction,
    pinned: true,
    pinLabel: "připnout reviewer",
    unpinLabel: "odepnout reviewer",
  },
}

export const Minimal: Story = {
  args: { description: undefined, badges: undefined, actions: undefined },
}
