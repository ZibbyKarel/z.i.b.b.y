import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "DesignSystem/Button",
  component: Button,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    intent: {
      control: "select",
      options: ["primary", "ghost", "danger"],
    },
    tone: { control: "select", options: ["accent", "ok", "warn", "bad"] },
    size: { control: "select", options: ["sm", "md"] },
  },
  args: { children: "Spustit", intent: "primary", size: "md" },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">variants</Typography>
        <div className="flex flex-wrap gap-3">
          <Button icon="play" intent="primary">
            Spustit
          </Button>
          <Button icon="edit" intent="ghost">
            Edit raw
          </Button>
          <Button icon="x" intent="danger">
            Zamítnout
          </Button>
          <Button icon="check" intent="primary" tone="ok">
            Schválit
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">sizes</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon="play" size="sm">
            sm
          </Button>
          <Button icon="play" size="md">
            md
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">states</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Spouštím…</Button>
          <Button loading intent="ghost">
            Načítám…
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">disabled — inert across every intent, not a faded fill</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled icon="play" intent="primary">
            Spustit
          </Button>
          <Button disabled icon="edit" intent="ghost">
            Edit raw
          </Button>
          <Button disabled icon="x" intent="danger">
            Zamítnout
          </Button>
          <Button disabled icon="check" intent="primary" tone="ok">
            Schválit
          </Button>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
