import type { Meta, StoryObj } from "@storybook/react";
import { ApprovalCard } from "./ApprovalCard";

const meta: Meta<typeof ApprovalCard> = {
  title: "DesignSystem/ApprovalCard",
  component: ApprovalCard,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    glyphSeed: "kevin-1",
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
        glyphSeed="kevin-1"
        meta="TASK · RND"
        request="Research artifact ready for review — 3 sources, 1 open question."
        taskRef="TASK · rnd-88 · research"
        waited="12m"
      />
      <ApprovalCard
        highRisk
        agentName="Release Bot"
        glyphSeed="release-bot"
        meta="PUSH · REL"
        request="Push to main on the release branch — 3 files changed, 42 additions, 6 deletions."
        waited="2m"
      />
      <ApprovalCard
        highRisk
        agentName="Ledger Clerk"
        density="row"
        glyphSeed="ledger-clerk"
        meta="PAYMENT · FIN"
        request="Pay the Vercel invoice — $48.00."
        waited="4m"
      />
    </div>
  ),
};

export const Playground: Story = {};
