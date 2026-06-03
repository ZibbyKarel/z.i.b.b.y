import type { Meta, StoryObj } from "@storybook/react"
import { Container } from "@zibby/design-system"
import { SectionToolbar } from "./SectionToolbar"

const meta: Meta<typeof SectionToolbar> = {
  title: "Dashboard/SectionToolbar",
  component: SectionToolbar,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container width="520px">
        <Story />
      </Container>
    ),
  ],
  args: { label: "moje skilly", addLabel: "Přidat skill" },
}
export default meta

type Story = StoryObj<typeof SectionToolbar>

export const Default: Story = {}

export const LabelOnly: Story = {
  args: { addLabel: undefined },
}
