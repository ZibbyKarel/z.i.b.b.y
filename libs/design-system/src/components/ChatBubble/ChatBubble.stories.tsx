import type { Meta, StoryObj } from "@storybook/react";
import { ChatBubble } from "./ChatBubble";

const meta: Meta<typeof ChatBubble> = {
  title: "DesignSystem/ChatBubble",
  component: ChatBubble,
};
export default meta;

type Story = StoryObj<typeof ChatBubble>;

export const Overview: Story = {
  render: () => (
    <div className="flex w-[380px] flex-col gap-2.5">
      <ChatBubble author="you">Ship the Kevin PR once green.</ChatBubble>
      <ChatBubble author="coo">On it — I’ll ping you when checks pass.</ChatBubble>
      <ChatBubble
        actions={
          <>
            <button className="border border-ink bg-ink px-2.5 py-1.5 text-panel" type="button">
              CREATE TASK
            </button>
            <button className="border border-line-2 px-2.5 py-1.5 text-ink-2" type="button">
              OPEN FORM →
            </button>
          </>
        }
        author="coo"
      >
        This looks like a task. Want me to create it?
      </ChatBubble>
    </div>
  ),
};
