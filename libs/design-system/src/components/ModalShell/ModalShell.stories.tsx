import type { Meta, StoryObj } from "@storybook/react";
import { ModalShell } from "./ModalShell";

const meta: Meta<typeof ModalShell> = {
  title: "Dashboard/ModalShell",
  component: ModalShell,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-screen">
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Nový skill",
    glyph: "spark",
    title: "Nový skill",
    subtitle: "vytvoří SKILL.md na disku",
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof ModalShell>;

export const Default: Story = {
  render: (args) => (
    <ModalShell {...args}>
      <div className="p-5 text-md text-foreground-dim">Obsah modalu.</div>
    </ModalShell>
  ),
};
