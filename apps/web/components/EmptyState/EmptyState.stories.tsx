import type { Meta, StoryObj } from "@storybook/react"
import { Container } from "@zibby/design-system"
import { EmptyState } from "./EmptyState"

const meta: Meta<typeof EmptyState> = {
  title: "Dashboard/EmptyState",
  component: EmptyState,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Container padding="300">
        <Story />
      </Container>
    ),
  ],
  args: {
    glyph: "spark",
    title: "Zatím žádné skilly",
    description: "Vytvoř svůj první SKILL.md a objeví se tady jako dlaždice.",
    actionLabel: "Přidat skill",
    hint: "~/zibby/skills/",
  },
}
export default meta

type Story = StoryObj<typeof EmptyState>

export const Default: Story = {}

export const WithoutAction: Story = {
  args: { actionLabel: undefined, hint: undefined },
}
