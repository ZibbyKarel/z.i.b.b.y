import type { Meta, StoryObj } from "@storybook/react";
import { Copyable } from "./Copyable";

const meta: Meta<typeof Copyable> = {
  title: "DesignSystem/Copyable",
  component: Copyable,
  args: { text: "feat/pr-detail", copyLabel: "Copy" },
};
export default meta;

type Story = StoryObj<typeof Copyable>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4 p-8">
      <Copyable text="feat/pr-detail" />
      <Copyable copyLabel="Copy PR number" text="#42">
        <a className="underline" href="https://example.com">
          Pull request #42
        </a>
      </Copyable>
      <Copyable reveal="always" text="main">
        <code className="font-mono">main</code>
      </Copyable>
    </div>
  ),
};

export const Playground: Story = {};
