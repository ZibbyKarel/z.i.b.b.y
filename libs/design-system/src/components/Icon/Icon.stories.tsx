import type { Meta, StoryObj } from "@storybook/react"
import { Icon, ZibbyMark, iconNames } from "./Icon"

const meta: Meta<typeof Icon> = {
  title: "Foundations/Icon",
  component: Icon,
  parameters: { backgrounds: { default: "velin" } },
  args: { name: "spark", size: 24, stroke: 1.6 },
}
export default meta

type Story = StoryObj<typeof Icon>

export const Single: Story = {}

export const AllGlyphs: Story = {
  render: () => (
    <div className="grid grid-cols-8 gap-4 text-foreground">
      {iconNames.map((name) => (
        <div
          key={name}
          className="flex flex-col items-center gap-2 rounded border border-border p-3"
        >
          <Icon name={name} size={22} />
          <span className="font-mono text-2xs text-foreground-faint">{name}</span>
        </div>
      ))}
    </div>
  ),
}

export const Brand: Story = {
  render: () => (
    <div className="flex items-center gap-3 text-foreground">
      <ZibbyMark size={28} />
      <span className="font-mono text-2xl font-bold tracking-mono">
        Z·I·B·B·Y
      </span>
    </div>
  ),
}
