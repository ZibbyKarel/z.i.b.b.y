import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Button } from "../Button/Button";
import { HoldButton } from "./HoldButton";

const meta: Meta<typeof HoldButton> = {
  title: "DesignSystem/HoldButton",
  component: HoldButton,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    size: { control: "radio", options: ["sm", "md"] },
  },
  args: {
    label: "Hold to approve",
    doneLabel: "Approved",
    armedLabel: "Press again to confirm",
  },
};
export default meta;

type Story = StoryObj<typeof HoldButton>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">
          hold — a 0.9s press grows the state-work fill; a short click arms it
        </Typography>
        <div className="flex flex-wrap items-center gap-3">
          <HoldButton doneLabel="Approved" label="Hold to approve" />
          <HoldButton
            armedLabel="Press again to merge"
            doneLabel="Merged"
            label="Squash and merge"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">sizes — sit flush beside Button of the same size</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <HoldButton label="Squash and merge" size="sm" />
          <Button intent="secondary" size="sm">
            Rebase on main
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <HoldButton label="Hold to approve" size="md" />
          <Button intent="secondary" size="md">
            Revise
          </Button>
          <Button intent="danger" size="md">
            Reject
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">block</Typography>
        <div className="w-[280px]">
          <HoldButton block label="Hold to approve" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">disabled</Typography>
        <div className="flex flex-wrap gap-3">
          <HoldButton disabled label="Hold to approve" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
