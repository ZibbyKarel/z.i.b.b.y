import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CommandPalette, type CommandPaletteGroup } from "./CommandPalette";

const groups: CommandPaletteGroup[] = [
  {
    label: "Pages",
    items: [
      { id: "overview", kind: "PAGE", label: "Overview", meta: "⌘1" },
      { id: "org", kind: "PAGE", label: "Org map", meta: "⌘2" },
    ],
  },
  {
    label: "Agents",
    items: [
      { id: "kevin", kind: "AGENT", label: "Kevin", meta: "RND" },
      { id: "ledger", kind: "AGENT", label: "Ledger clerk", meta: "FIN" },
    ],
  },
  {
    label: "Commands",
    items: [{ id: "new-task", kind: "/COMMAND", label: "/new-task", meta: "" }],
  },
];

const meta: Meta<typeof CommandPalette> = {
  title: "DesignSystem/CommandPalette",
  component: CommandPalette,
  parameters: { backgrounds: { default: "velin" } },
  args: { open: true, groups, query: "s" },
};
export default meta;

type Story = StoryObj<typeof CommandPalette>;

export const Overview: Story = {
  render: function OverviewStory() {
    const [query, setQuery] = useState("s");
    return (
      <div className="h-[560px]">
        <CommandPalette
          open
          groups={groups}
          onOpenChange={() => {}}
          onQueryChange={setQuery}
          query={query}
        />
      </div>
    );
  },
};

export const Playground: Story = {
  render: function PlaygroundStory(args) {
    const [query, setQuery] = useState(args.query);
    return <CommandPalette {...args} onQueryChange={setQuery} query={query} />;
  },
};
