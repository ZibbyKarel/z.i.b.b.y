import type { Meta, StoryObj } from "@storybook/react"
import { Container } from "@zibby/design-system"
import { LimitsPanel } from "./LimitsPanel"

const meta: Meta<typeof LimitsPanel> = {
  title: "Dashboard/Layout/LimitsPanel",
  component: LimitsPanel,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container width="420px">
        <Story />
      </Container>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof LimitsPanel>

// No live API in Storybook — the query stays pending, so the panel renders from
// the static zero-usage CLAUDE_LIMITS fallback.
export const Default: Story = {}
