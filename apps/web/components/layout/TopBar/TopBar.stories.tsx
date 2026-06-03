import type { Meta, StoryObj } from "@storybook/react"
import { Typography } from "@zibby/design-system"
import { TopBar } from "./TopBar"

const meta: Meta<typeof TopBar> = {
  title: "Dashboard/Layout/TopBar",
  component: TopBar,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  args: { breadcrumb: "Přehled" },
}
export default meta

type Story = StoryObj<typeof TopBar>

export const Default: Story = {}

export const WithWalletSlot: Story = {
  args: {
    walletSlot: (
      <Typography mono size="sm" type="note" variant="secondary">
        $128.40
      </Typography>
    ),
  },
}
