import type { Meta, StoryObj } from "@storybook/react";
import { Button, Container } from "@zibby/design-system";
import { SectionLabel } from "./SectionLabel";

const meta: Meta<typeof SectionLabel> = {
  title: "Dashboard/SectionLabel",
  component: SectionLabel,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container width="520px">
        <Story />
      </Container>
    ),
  ],
  args: { children: "moje skilly" },
};
export default meta;

type Story = StoryObj<typeof SectionLabel>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    action: (
      <Button icon="plus" intent="primary" size="sm">
        Přidat skill
      </Button>
    ),
  },
};
