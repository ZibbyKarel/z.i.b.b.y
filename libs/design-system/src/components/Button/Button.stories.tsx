import type { Meta, StoryObj } from "@storybook/react"
import { Button } from "./Button"

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    intent: {
      control: "select",
      options: ["run", "solid", "ghost", "approve", "reject"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
  args: { children: "Spustit", intent: "run", size: "md" },
}
export default meta

type Story = StoryObj<typeof Button>

export const Run: Story = { args: { icon: "play" } }
export const Solid: Story = { args: { intent: "solid", icon: "play" } }
export const Ghost: Story = { args: { intent: "ghost", icon: "edit", children: "Edit raw SKILL.md" } }
export const Approve: Story = { args: { intent: "approve", icon: "check", children: "Schválit" } }
export const Reject: Story = { args: { intent: "reject", icon: "x", children: "Zamítnout" } }

export const AllIntents: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button intent="run" icon="play">Spustit</Button>
      <Button intent="solid" icon="play">Spustit</Button>
      <Button intent="ghost" icon="edit">Edit raw</Button>
      <Button intent="approve" icon="check">Schválit</Button>
      <Button intent="reject" icon="x">Zamítnout</Button>
    </div>
  ),
}
