import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "../Container/Container";
import { Typography } from "../Typography/Typography";
import { Surface } from "./Surface";

const meta: Meta<typeof Surface> = {
  title: "Components/Surface",
  component: Surface,
  parameters: { layout: "fullscreen", backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Surface>;

export const HudShell: Story = {
  render: () => (
    <Container height="320px">
      <Surface grid scanlines>
        <Container padding="400">
          <Typography type="title">HUD shell</Typography>
          <Typography type="note" variant="secondary">
            Blueprint grid + scanline overlays live inside the design system.
          </Typography>
        </Container>
      </Surface>
    </Container>
  ),
};
