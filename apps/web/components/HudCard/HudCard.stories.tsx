import type { Meta, StoryObj } from "@storybook/react"
import { Button, Container, Icon, Tag } from "@zibby/design-system"
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
    <Tag key="model" tone="neutral">
      sonnet
    </Tag>,
    <Tag key="think" tone="neutral">
      ◇ medium
    </Tag>,
    <Tag key="usage" tone="accent">
      <Icon name="flow" size="xs" /> 3 pipelines
    </Tag>,
  ],
  [
    <Tag key="read" tone="neutral">
      read
    </Tag>,
    <Tag key="grep" tone="neutral">
      grep
    </Tag>,
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

export const Minimal: Story = {
  args: { description: undefined, badges: undefined, actions: undefined },
}
