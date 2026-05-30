import type { Meta, StoryObj } from "@storybook/react"
import { Pill } from "./Pill"

const meta: Meta<typeof Pill> = {
  title: "Components/Pill",
  component: Pill,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "hotovo", tone: "ok" },
}
export default meta

type Story = StoryObj<typeof Pill>

export const Default: Story = {}

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Pill tone="neutral">neutral</Pill>
      <Pill tone="accent">work</Pill>
      <Pill tone="ok">hotovo</Pill>
      <Pill tone="warn">zaparkováno</Pill>
      <Pill tone="bad">selhalo</Pill>
      <Pill tone="opus">opus</Pill>
      <Pill tone="sonnet">sonnet</Pill>
      <Pill tone="haiku">haiku</Pill>
      <Pill tone="think-high">◇ high</Pill>
      <Pill tone="think-medium">◇ medium</Pill>
      <Pill tone="think-low">◇ low</Pill>
    </div>
  ),
}
