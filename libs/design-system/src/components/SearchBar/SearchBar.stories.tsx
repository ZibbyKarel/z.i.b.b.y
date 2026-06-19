import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { SearchBar } from "./SearchBar";

const meta: Meta<typeof SearchBar> = {
  title: "DesignSystem/SearchBar",
  component: SearchBar,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    placeholder: "Command or skill…",
    ariaLabel: "Command or skill",
    shortcut: "⌘K",
  },
};
export default meta;

type Story = StoryObj<typeof SearchBar>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6" style={{ width: 360, maxWidth: "100%" }}>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          with shortcut
        </Typography>
        <SearchBar ariaLabel="Command or skill" placeholder="Command or skill…" shortcut="⌘K" />
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          without shortcut
        </Typography>
        <SearchBar ariaLabel="Search" placeholder="Search…" />
      </div>
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => (
    <div style={{ width: 360, maxWidth: "100%" }}>
      <SearchBar {...args} />
    </div>
  ),
};
