import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "@zibby/design-system";
import { BrandLogo } from "./BrandLogo";

const meta: Meta<typeof BrandLogo> = {
  title: "Dashboard/Layout/BrandLogo",
  component: BrandLogo,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container style={{ background: "var(--color-background)" }} width="224px">
        <Story />
      </Container>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof BrandLogo>;

export const Default: Story = {};
