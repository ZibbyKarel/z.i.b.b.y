import type { Meta, StoryObj } from "@storybook/react";
import { PipelineChips } from "./PipelineChips";

const meta: Meta<typeof PipelineChips> = {
  title: "DesignSystem/PipelineChips",
  component: PipelineChips,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    chips: [
      { code: "DEV", state: "working" },
      { code: "QA", state: "thinking" },
      { code: "OPS", state: "idle" },
    ],
  },
};
export default meta;

type Story = StoryObj<typeof PipelineChips>;

export const Overview: Story = {
  render: () => (
    <PipelineChips
      chips={[
        { code: "DEV", state: "done" },
        { code: "QA", state: "working" },
        { code: "SEC", state: "blocked" },
        { code: "OPS", state: "error" },
        { code: "REL", state: "idle" },
      ]}
    />
  ),
};
export const Playground: Story = {};
