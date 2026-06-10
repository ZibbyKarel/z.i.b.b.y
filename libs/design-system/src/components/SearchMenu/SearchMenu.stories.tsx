import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchMenu, type SearchMenuSection } from "./SearchMenu";

const SECTIONS: SearchMenuSection[] = [
  {
    id: "agents",
    label: "Agents",
    items: [
      { id: "writer", title: "Writer", subtitle: "Writes Czech copy", glyph: "bot" },
      { id: "reviewer", title: "Reviewer", subtitle: "Reviews pull requests", glyph: "bot" },
    ],
  },
  {
    id: "skills",
    label: "Skills",
    items: [{ id: "summarize", title: "Summarize", subtitle: "TL;DR any document", glyph: "spark" }],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [{ id: "slack", title: "Slack", subtitle: "Disconnected", glyph: "plug" }],
  },
];

const meta: Meta<typeof SearchMenu> = {
  title: "DesignSystem/SearchMenu",
  component: SearchMenu,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof SearchMenu>;

/** A controlled wrapper so the stories are interactive (typing, opening, selecting). */
function Demo({
  sections,
  initialValue = "",
  initialOpen = false,
  loading = false,
  emptyLabel,
}: {
  sections: SearchMenuSection[];
  initialValue?: string;
  initialOpen?: boolean;
  loading?: boolean;
  emptyLabel?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(initialOpen);
  return (
    <div style={{ width: 360, maxWidth: "100%" }}>
      <SearchMenu
        ariaLabel="Search the workspace"
        emptyLabel={emptyLabel}
        loading={loading}
        onOpenChange={setOpen}
        onSelect={() => setOpen(false)}
        onValueChange={setValue}
        open={open}
        placeholder="Search agents, skills, projects…"
        sections={sections}
        shortcut="⌘K"
        value={value}
      />
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8" style={{ minHeight: 420 }}>
      <Demo initialOpen initialValue="re" sections={SECTIONS} />
      <Demo initialOpen loading initialValue="xyz" sections={[]} />
      <Demo
        initialOpen
        emptyLabel="No results"
        initialValue="xyz"
        sections={[]}
      />
    </div>
  ),
};

export const Playground: Story = {
  render: () => <Demo initialOpen initialValue="re" sections={SECTIONS} />,
};
