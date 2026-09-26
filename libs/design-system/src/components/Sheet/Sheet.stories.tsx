import type { Meta, StoryObj } from "@storybook/react";
import { Sheet } from "./Sheet";
import { Button } from "../Button/Button";
import { Typography } from "../Typography/Typography";

const meta: Meta<typeof Sheet> = {
  title: "DesignSystem/Sheet",
  component: Sheet,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    open: true,
    title: "Approval · APR-142",
    children: "Sheet body content.",
  },
};
export default meta;

type Story = StoryObj<typeof Sheet>;

export const Overview: Story = {
  render: () => (
    <div className="flex h-[560px] flex-col gap-6">
      <Sheet
        open
        footer={
          <div className="flex gap-2">
            <Button block intent="secondary">
              Deny
            </Button>
            <Button block intent="primary">
              Approve
            </Button>
          </div>
        }
        onClose={() => {}}
        title="Approval · APR-142"
        width="lg"
      >
        <Typography type="body">
          Push to main on the release branch — 3 files changed, 42 additions, 6 deletions.
        </Typography>
      </Sheet>
    </div>
  ),
};

export const Playground: Story = {};
