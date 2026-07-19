import type { Meta, StoryObj } from "@storybook/react";
import { Button, Container, Stack, Typography } from "@zibby/design-system";
import { HudPanel } from "./HudPanel";

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
  args: { title: "běžící agenti" },
};
export default meta;

type Story = StoryObj<typeof HudPanel>;

export const Default: Story = {
  render: (args) => (
    <HudPanel {...args}>
      <Typography size="md" type="note" variant="secondary">
        Matný panel s mono popiskem — rohové závorky nese jen živý panel.
      </Typography>
    </HudPanel>
  ),
};

export const WithAction: Story = {
  render: (args) => (
    <HudPanel
      {...args}
      action={
        <Button icon="plus" intent="ghost" size="sm">
          Přidat skill
        </Button>
      }
      tone="run"
    >
      <Typography size="md" type="note" variant="secondary">
        Živý panel s akcí v titulkovém řádku.
      </Typography>
    </HudPanel>
  ),
};

// D7 (docs/hud2chat/DECISIONS.md) — the two `surface` variants side by side:
// "hud" (today's bordered Card, default) vs "glass" (Velín-D translucent
// treatment, opt-in per migrated page).
export const Surfaces: Story = {
  render: (args) => (
    <Stack gap="200">
      <HudPanel {...args} surface="hud" title="hud (výchozí)">
        <Typography size="md" type="note" variant="secondary">
          Matný panel s ohraničením — beze změny.
        </Typography>
      </HudPanel>
      <HudPanel {...args} surface="glass" title="glass">
        <Typography size="md" type="note" variant="secondary">
          Průsvitný Velín-D povrch pro migrované stránky.
        </Typography>
      </HudPanel>
    </Stack>
  ),
};
