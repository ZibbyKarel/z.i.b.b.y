import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { CodeBlock } from "./CodeBlock";

const sample = [
  "$ zibby run agent triage",
  "→ spawning run agent_1717490000_a1b2",
  "✓ loaded 3 skills",
  "… streaming output",
].join("\n");

const meta: Meta<typeof CodeBlock> = {
  title: "DesignSystem/CodeBlock",
  component: CodeBlock,
  args: { text: sample, maxHeight: "md", caret: false },
  argTypes: {
    maxHeight: { control: "radio", options: ["sm", "md", "lg", "viewport"] },
  },
  decorators: [
    (Story) => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CodeBlock>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          text + live caret
        </Typography>
        <CodeBlock caret maxHeight="sm" text={sample} />
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          empty + placeholder
        </Typography>
        <CodeBlock maxHeight="sm" placeholder="waiting for output…" text="" />
      </div>
    </div>
  ),
};

export const Playground: Story = {};
