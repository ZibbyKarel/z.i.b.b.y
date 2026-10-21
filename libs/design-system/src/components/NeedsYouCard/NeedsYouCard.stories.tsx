import type { Meta, StoryObj } from "@storybook/react";
import { NeedsYouCard } from "./NeedsYouCard";

const meta: Meta<typeof NeedsYouCard> = {
  title: "DesignSystem/NeedsYouCard",
  component: NeedsYouCard,
  args: {
    heading: "NEEDS YOU · PUSH",
    wait: "WAITING 2H",
    text: "Push the branch to origin?",
    approveLabel: "APPROVE",
    denyLabel: "DENY",
    onApprove: () => {},
    onDeny: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof NeedsYouCard>;

export const Overview: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4 pb-4">
      <NeedsYouCard {...args} diff={["@@ -1 +1 @@", "-a", "+b"]} rule="RULE · no-force-push" />
      <NeedsYouCard heading="NEEDS YOU · QUESTION" text="Which environment?" wait="WAITING 5M" />
    </div>
  ),
};
export const Playground: Story = {};
