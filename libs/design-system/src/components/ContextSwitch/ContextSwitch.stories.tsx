import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react"
import type { ContextName } from "../../domain"
import { ContextSwitch } from "./ContextSwitch"

const meta: Meta<typeof ContextSwitch> = {
  title: "Velín/ContextSwitch",
  component: ContextSwitch,
  parameters: { backgrounds: { default: "velin" } },
}
export default meta

type Story = StoryObj<typeof ContextSwitch>

export const Interactive: Story = {
  render: () => {
    const [ctx, setCtx] = useState<ContextName>("home")
    return <ContextSwitch context={ctx} onContextChange={setCtx} />
  },
}
