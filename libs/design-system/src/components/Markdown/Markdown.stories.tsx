import type { Meta, StoryObj } from "@storybook/react";
import { Markdown } from "./Markdown";

const SAMPLE = `# Reviewer

Use this agent when reviewing a diff before push.

## Workflow

1. Read the changed files
2. Flag correctness bugs
3. Suggest simplifications

- Keep findings **high-signal**
- Prefer *small* diffs

See the [contributing guide](https://example.com) for details.

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

> Keep findings high-signal.
`;

const meta: Meta<typeof Markdown> = {
  title: "DesignSystem/Markdown",
  component: Markdown,
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

type Story = StoryObj<typeof Markdown>;

export const Overview: Story = {
  render: () => <Markdown source={SAMPLE} />,
};

export const Playground: Story = {
  argTypes: {
    source: { control: "text" },
    escapeHtml: { control: "boolean" },
  },
  args: {
    source: SAMPLE,
    escapeHtml: false,
  },
};
