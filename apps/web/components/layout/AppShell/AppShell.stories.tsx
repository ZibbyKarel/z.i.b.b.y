import type { Meta, StoryObj } from "@storybook/react";
import { Container, Typography } from "@zibby/design-system";
import { AppShell } from "./AppShell";

// F10: AppShell no longer forks on the route (the HUD chrome + its route table
// are deleted) — it is just the provider stack (catalog/new-task/chat) around a
// full-height container. Every route renders its own immersive chrome.
const meta: Meta<typeof AppShell> = {
  title: "Dashboard/Layout/AppShell",
  component: AppShell,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  args: {
    children: (
      <Container padding="300">
        <Typography type="note" variant="secondary">
          Providers appky (catalog/new-task/chat) kolem obsahu stránky.
        </Typography>
      </Container>
    ),
  },
};
export default meta;

type Story = StoryObj<typeof AppShell>;

export const Default: Story = {};
