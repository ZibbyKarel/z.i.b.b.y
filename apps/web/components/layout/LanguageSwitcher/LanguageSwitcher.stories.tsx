import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "@zibby/design-system";
import { LanguageSwitcher } from "./LanguageSwitcher";

const meta: Meta<typeof LanguageSwitcher> = {
  title: "Dashboard/Layout/LanguageSwitcher",
  component: LanguageSwitcher,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container width="220px">
        <Story />
      </Container>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof LanguageSwitcher>;

export const Default: Story = {};
