import type { Meta, StoryObj } from "@storybook/react";
import { ApprovalCard } from "./ApprovalCard";

const meta: Meta<typeof ApprovalCard> = {
  title: "DesignSystem/ApprovalCard",
  component: ApprovalCard,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    glyph: "flask",
    color: "#8b5cf6",
    agentName: "Kevin",
    meta: "TASK · RND",
    waited: "12m",
    request: "Research artifact ready for review — 3 sources, 1 open question.",
    taskRef: "TASK · rnd-88 · research",
  },
};
export default meta;

type Story = StoryObj<typeof ApprovalCard>;

export const Overview: Story = {
  render: () => (
    <div className="flex w-[340px] flex-col gap-4">
      <ApprovalCard
        agentName="Kevin"
        color="#8b5cf6"
        glyph="flask"
        meta="TASK · RND"
        request="Research artifact ready for review — 3 sources, 1 open question."
        taskRef="TASK · rnd-88 · research"
        waited="12m"
      />
      <ApprovalCard
        highRisk
        agentName="Release Bot"
        color="#5b8def"
        glyph="branch"
        meta="PUSH · REL"
        request="Push to main on the release branch — 3 files changed, 42 additions, 6 deletions."
        waited="2m"
      />
      <ApprovalCard
        highRisk
        agentName="Ledger Clerk"
        color="#f59e0b"
        density="row"
        glyph="dollar"
        meta="PAYMENT · FIN"
        request="Pay the Vercel invoice — $48.00."
        waited="4m"
      />
    </div>
  ),
};

export const Playground: Story = {};
