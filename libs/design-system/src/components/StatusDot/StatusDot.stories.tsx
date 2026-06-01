import type { Meta, StoryObj } from "@storybook/react"
import { StatusDot } from "./StatusDot"

const meta: Meta<typeof StatusDot> = {
  title: "Components/StatusDot",
  component: StatusDot,
  parameters: { backgrounds: { default: "velin" } },
  args: { tone: "ok", size: "100", pulse: false },
}
export default meta

type Story = StoryObj<typeof StatusDot>

export const Default: Story = {}

export const Tones: Story = {
  render: () => (
    <div className="flex items-center gap-5">
      <StatusDot tone="ok" pulse />
      <StatusDot tone="warn" />
      <StatusDot tone="bad" pulse />
      <StatusDot tone="run" pulse />
      <StatusDot tone="home" />
      <StatusDot tone="work" />
      <StatusDot tone="faint" />
    </div>
  ),
}
