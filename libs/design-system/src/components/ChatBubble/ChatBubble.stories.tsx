import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../Button/Button";
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
      <ChatBubble author="assistant">On it — I’ll ping you when checks pass.</ChatBubble>
      <ChatBubble
        actions={
          <>
            <Button intent="primary" size="sm">
              Create task
            </Button>
            <Button intent="secondary" size="sm">
              Open form
            </Button>
          </>
        }
        author="assistant"
      >
        This looks like a task. Want me to create it?
      </ChatBubble>
    </div>
  ),
};

export const Playground: Story = {
  args: { author: "assistant", children: "On it — I’ll ping you when checks pass." },
  argTypes: { author: { control: "inline-radio", options: ["you", "assistant"] } },
};
