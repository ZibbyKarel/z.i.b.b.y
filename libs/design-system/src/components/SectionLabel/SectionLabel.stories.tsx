import type { Meta, StoryObj } from "@storybook/react"
import { Button } from "../Button/Button"
import { SectionLabel } from "./SectionLabel"

const meta: Meta<typeof SectionLabel> = {
  title: "Components/SectionLabel",
  component: SectionLabel,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [(Story) => <div className="w-80"><Story /></div>],
  args: { children: "Pipeline · work" },
}
export default meta

type Story = StoryObj<typeof SectionLabel>

export const Default: Story = {}

export const WithAction: Story = {
  args: {
    action: (
      <Button intent="ghost" icon="plus" size="sm">
        Přidat pipeline
      </Button>
    ),
  },
}
