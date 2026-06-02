import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownEditor } from "./MarkdownEditor";

const SAMPLE = `# Reviewer

Use this agent when reviewing a diff before push.

## Workflow

1. Read the changed files
2. Flag correctness bugs
3. Suggest simplifications

> Keep findings high-signal.
`;

const meta: Meta<typeof MarkdownEditor> = {
  title: "DesignSystem/MarkdownEditor",
  component: MarkdownEditor,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MarkdownEditor>;

export const Overview: Story = {
  render: () => {
    const [value, setValue] = useState(SAMPLE);
    return (
      <MarkdownEditor
        hint="Frontmatter is assembled by the backend — body only."
        label="agent.md"
        onChange={setValue}
        value={value}
      />
    );
  },
};

export const Playground: Story = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <MarkdownEditor
        hint="Nápověda k editoru"
        label="agent.md"
        onChange={setValue}
        placeholder="Markdown popis agenta…"
        value={value}
      />
    );
  },
};
