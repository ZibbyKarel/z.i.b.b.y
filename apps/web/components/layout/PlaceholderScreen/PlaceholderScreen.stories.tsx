import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "@zibby/design-system";
import { PlaceholderScreen } from "./PlaceholderScreen";

const meta: Meta<typeof PlaceholderScreen> = {
  title: "Dashboard/Layout/PlaceholderScreen",
  component: PlaceholderScreen,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Container padding="300">
        <Story />
      </Container>
    ),
  ],
  args: { label: "Běhy", glyph: "flow" },
};
export default meta;

type Story = StoryObj<typeof PlaceholderScreen>;

export const Default: Story = {};
