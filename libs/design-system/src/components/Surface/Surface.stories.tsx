import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "../Container/Container";
import { Typography } from "../Typography/Typography";
import { Surface } from "./Surface";

const meta: Meta<typeof Surface> = {
  title: "DesignSystem/Surface",
  component: Surface,
  parameters: { layout: "fullscreen", backgrounds: { default: "velin" } },
  argTypes: {
    background: { control: "select", options: ["surface", "background", "scene"] },
  },
  args: { background: "scene" },
};
export default meta;

type Story = StoryObj<typeof Surface>;

export const Overview: Story = {
  render: () => (
    <Container height="320px">
      <Surface background="scene">
        <Container padding="400">
          <Typography type="title">Velín scene</Typography>
          <Typography type="note" variant="secondary">
            Depth comes from the radial gradient — no scanlines, no grid.
          </Typography>
        </Container>
      </Surface>
    </Container>
  ),
};

export const Playground: Story = {
  render: (args) => (
    <Container height="320px">
      <Surface {...args}>
        <Container padding="400">
          <Typography type="title">Surface</Typography>
        </Container>
      </Surface>
    </Container>
  ),
};
