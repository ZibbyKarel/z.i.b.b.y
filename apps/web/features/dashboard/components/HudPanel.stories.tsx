import type { Meta, StoryObj } from "@storybook/react"
import { Button, Container, Typography } from "@zibby/design-system"
import { HudPanel } from "./HudPanel"

const meta: Meta<typeof HudPanel> = {
  title: "Dashboard/HudPanel",
  component: HudPanel,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container width="420px">
        <Story />
      </Container>
    ),
  ],
  args: { title: "rychlé spuštění · home", corners: true },
}
export default meta

type Story = StoryObj<typeof HudPanel>

export const Default: Story = {
  render: (args) => (
    <HudPanel {...args}>
      <Typography size="md" type="note" variant="secondary">
        Angular HUD panel s rohovými chevrony a <code>{'// title'}</code> popiskem.
      </Typography>
    </HudPanel>
  ),
}

export const WithAction: Story = {
  render: (args) => (
    <HudPanel {...args} action={<Button icon="plus" intent="ghost" size="sm">Přidat skill</Button>}>
      <Typography size="md" type="note" variant="secondary">
        Panel s akcí v titulkovém řádku.
      </Typography>
    </HudPanel>
  ),
}
