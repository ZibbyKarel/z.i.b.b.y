import type { Meta, StoryObj } from "@storybook/react"
import { Button } from "@zibby/design-system"
import { HudPanel } from "./HudPanel"

const meta: Meta<typeof HudPanel> = {
  title: "Dashboard/HudPanel",
  component: HudPanel,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    ),
  ],
  args: { title: "rychlé spuštění · home", corners: true },
}
export default meta

type Story = StoryObj<typeof HudPanel>

export const Default: Story = {
  render: (args) => (
    <HudPanel {...args}>
      <p className="text-md text-foreground-dim">
        Angular HUD panel s rohovými chevrony a <code>// title</code> popiskem.
      </p>
    </HudPanel>
  ),
}

export const WithAction: Story = {
  render: (args) => (
    <HudPanel {...args} action={<Button intent="ghost" icon="plus" size="sm">Přidat skill</Button>}>
      <p className="text-md text-foreground-dim">Panel s akcí v titulkovém řádku.</p>
    </HudPanel>
  ),
}
