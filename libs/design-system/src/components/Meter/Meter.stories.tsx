import type { Meta, StoryObj } from "@storybook/react"
import { Meter } from "./Meter"

const meta: Meta<typeof Meter> = {
  title: "Components/Meter",
  component: Meter,
  parameters: { backgrounds: { default: "velin" } },
  args: { value: 64, tone: "warn", glow: true, height: 6 },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof Meter>

export const Default: Story = {}

export const Tones: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-3">
      <Meter value={38} tone="ok" glow />
      <Meter value={64} tone="warn" glow />
      <Meter value={92} tone="bad" glow />
      <Meter value={36} tone="accent" glow />
    </div>
  ),
}
