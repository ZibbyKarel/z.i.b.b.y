import type { Meta, StoryObj } from "@storybook/react"
import { Sparkline } from "./Sparkline"

const meta: Meta<typeof Sparkline> = {
  title: "Components/Sparkline",
  component: Sparkline,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [(Story) => <div className="w-[260px]"><Story /></div>],
  args: { data: [4, 6, 9, 7, 12, 8, 14, 11, 9, 13, 16, 12, 10, 15] },
}
export default meta

type Story = StoryObj<typeof Sparkline>

export const Default: Story = {}
