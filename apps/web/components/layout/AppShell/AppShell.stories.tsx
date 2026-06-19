import type { Meta, StoryObj } from "@storybook/react";
import { Container, Typography } from "@zibby/design-system";
import { AppShell } from "./AppShell";

// AppShell reads the active route via next/navigation, which Storybook aliases
// to a stub resolving to /overview — so the overview item shows as active.
const meta: Meta<typeof AppShell> = {
  title: "Dashboard/Layout/AppShell",
  component: AppShell,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  args: {
    children: (
      <Container padding="300">
        <Typography type="note" variant="secondary">
          Kompletní shell appky: providers + sidebar + top bar kolem obsahu.
        </Typography>
      </Container>
    ),
  },
};
export default meta;

type Story = StoryObj<typeof AppShell>;

export const Default: Story = {};
