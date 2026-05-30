import type { Meta, StoryObj } from "@storybook/react"
import { Stat } from "./Stat"

const meta: Meta<typeof Stat> = {
  title: "Components/Stat",
  component: Stat,
  parameters: { backgrounds: { default: "velin" } },
  args: { value: "02", label: "běžící agenti", icon: "pulse", tone: "accent" },
}
export default meta

type Story = StoryObj<typeof Stat>

export const Default: Story = {}

export const Row: Story = {
  render: () => (
    <div className="flex flex-wrap gap-9">
      <Stat value="02" label="běžící agenti" icon="pulse" tone="accent" />
      <Stat value="01" label="schválení" icon="shield" tone="bad" />
      <Stat value="$128" label="agent sdk kredit" icon="dollar" tone="warn" />
      <Stat value="04" label="pipeline" icon="flow" tone="neutral" />
    </div>
  ),
}
