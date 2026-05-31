import type { Meta, StoryObj } from "@storybook/react";
import type { Approval } from "../../domain";
import { ApprovalCard } from "./ApprovalCard";

const approval: Approval = {
  id: "ap1",
  skill: "rohlik",
  ctx: "home",
  action: "Objednat košík",
  detail: "14 položek · 1 248 Kč · doručení zítra 18–20h",
  risk: "platba",
};

const meta: Meta<typeof ApprovalCard> = {
  title: "Dashboard/ApprovalCard",
  component: ApprovalCard,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
  args: { approval },
};
export default meta;

type Story = StoryObj<typeof ApprovalCard>;

export const Default: Story = {};
