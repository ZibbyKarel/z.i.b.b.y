import type { Meta, StoryObj } from "@storybook/react";
import { InputFrame } from "./InputFrame";

const meta: Meta<typeof InputFrame> = {
  title: "DesignSystem/InputFrame",
  component: InputFrame,
};
export default meta;

type Story = StoryObj<typeof InputFrame>;

export const Overview: Story = {
  render: () => (
    <div className="w-[360px]">
      <InputFrame
        end={<span className="w-[34px] text-center text-ink-2">mic</span>}
        start={<span className="w-[34px] text-center text-ink-2">clip</span>}
      >
        <input
          aria-label="Message"
          className="w-full bg-transparent text-[13px] outline-none"
          placeholder="Ask Zibby or describe a task"
        />
      </InputFrame>
    </div>
  ),
};
