import type { Meta, StoryObj } from "@storybook/react";
import { ToggleChip } from "./ToggleChip";

const meta: Meta<typeof ToggleChip> = {
  title: "DesignSystem/ToggleChip",
  component: ToggleChip,
  args: { children: "ALL", pressed: true },
};
export default meta;

type Story = StoryObj<typeof ToggleChip>;

const Dot = () => <span className="inline-block size-[18px] rounded-full bg-state-work" />;

export const Overview: Story = {
  render: () => (
    <div className="flex gap-2">
      <ToggleChip pressed>ALL</ToggleChip>
      <ToggleChip leading={<Dot />} pressed={false}>
        Architect
      </ToggleChip>
      <ToggleChip leading={<Dot />} pressed={false}>
        Coder
      </ToggleChip>
    </div>
  ),
};

export const Playground: Story = {};
