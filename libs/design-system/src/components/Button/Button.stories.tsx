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
      options: ["run", "solid", "ghost", "outline", "approve", "reject"],
    },
    size: { control: "select", options: ["xs", "sm", "md", "lg"] },
  },
  args: { children: "Spustit", intent: "run", size: "md" },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          intents
        </Typography>
        <div className="flex flex-wrap gap-3">
          <Button icon="play" intent="run">
            Spustit
          </Button>
          <Button icon="play" intent="solid">
            Spustit
          </Button>
          <Button icon="edit" intent="ghost">
            Edit raw
          </Button>
          <Button icon="mic" intent="outline" size="xs">
            Voice
          </Button>
          <Button icon="check" intent="approve">
            Schválit
          </Button>
          <Button icon="x" intent="reject">
            Zamítnout
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon="play" intent="run" size="xs">
            xs
          </Button>
          <Button icon="play" intent="run" size="sm">
            sm
          </Button>
          <Button icon="play" intent="run" size="md">
            md
          </Button>
          <Button icon="play" intent="run" size="lg">
            lg
          </Button>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
