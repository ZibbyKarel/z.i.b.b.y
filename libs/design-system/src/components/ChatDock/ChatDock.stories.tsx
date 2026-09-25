import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChatDock } from "./ChatDock";
import { AgentGlyph } from "../AgentGlyph/AgentGlyph";
import { Chip } from "../Chip/Chip";

const composer = (
  <input
    aria-label="Message"
    className="h-8 w-full border border-line-2 bg-background px-2.5 text-[13px] outline-none"
    placeholder="Ask Zibby…"
  />
);

const transcript = (
  <div className="flex flex-col gap-2.5">
    <div className="self-end max-w-[80%] bg-ink px-2.5 py-2 text-[13px] text-panel">
      Ship the Kevin PR once green.
    </div>
    <div className="self-start max-w-[86%] border border-line-2 bg-background px-2.5 py-2 text-[13px]">
      On it — I’ll ping you when checks pass.
    </div>
  </div>
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
    <div className="flex flex-wrap items-end gap-8">
      <ChatDock avatar={<AgentGlyph seed="Zibby" size={22} state="idle" />} composer={composer} />
      <ChatDock
        defaultOpen
        avatar={<AgentGlyph seed="Zibby" size={22} state="idle" />}
        composer={composer}
        transcript={transcript}
      />
      <ChatDock
        avatar={<AgentGlyph seed="Zibby" size={22} state="idle" />}
        composer={composer}
        latestLine="On it — I’ll ping you when checks pass."
        targetChip={<Chip>Dept: dev</Chip>}
      />
    </div>
  ),
};

export const Playground: Story = {
  args: { composer },
  render: (args) => {
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <ChatDock
          {...args}
          avatar={<AgentGlyph seed="Zibby" size={22} state="idle" />}
          onOpenChange={setOpen}
          open={open}
          transcript={transcript}
        />
      );
    }
    return <Controlled />;
  },
};
