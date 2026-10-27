import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChatDock } from "./ChatDock";
import { Button } from "../Button/Button";
import { ChatBubble } from "../ChatBubble/ChatBubble";
import { Chip } from "../Chip/Chip";
import { InputFrame } from "../InputFrame/InputFrame";

const composer = (
  <InputFrame
    end={
      <span className="pr-1">
        <Button intent="primary" size="sm">
          Send
        </Button>
      </span>
    }
  >
    <input
      aria-label="Message"
      className="h-8 w-full bg-transparent px-1.5 text-[13px] text-ink outline-none placeholder:text-foreground-faint"
      placeholder="Ask Zibby…"
    />
  </InputFrame>
);

const transcript = (
  <>
    <ChatBubble author="you">Ship the Kevin PR once green.</ChatBubble>
    <ChatBubble
      actions={
        <Button intent="primary" size="sm">
          Create task
        </Button>
      }
      author="assistant"
    >
      On it — I’ll ping you when checks pass.
    </ChatBubble>
  </>
);

const meta: Meta<typeof ChatDock> = {
  title: "DesignSystem/ChatDock",
  component: ChatDock,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof ChatDock>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end gap-8">
        <ChatDock composer={composer} />
        <ChatDock composer={composer} targetChip={<Chip>Dept: dev</Chip>} />
      </div>
      <div className="flex h-[640px] items-end">
        <ChatDock defaultOpen composer={composer} onNewChat={() => {}} transcript={transcript} />
      </div>
      <div className="flex h-[640px] w-[1200px] items-end">
        <ChatDock
          defaultOpen
          composer={composer}
          sidebar={<div className="text-[13px]">Recent conversations…</div>}
          transcript={transcript}
        />
      </div>
    </div>
  ),
};

export const Playground: Story = {
  args: { composer },
  render: (args) => {
    function Controlled() {
      const [open, setOpen] = useState(false);
      return <ChatDock {...args} onOpenChange={setOpen} open={open} transcript={transcript} />;
    }
    return <Controlled />;
  },
};
