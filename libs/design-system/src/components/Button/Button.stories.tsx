import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    intent: {
      control: "select",
      options: ["run", "solid", "ghost", "approve", "reject"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
  args: { children: "Spustit", intent: "run", size: "md" },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          intents
        </Typography>
        <div className="flex flex-wrap gap-3">
          <Button intent="run" icon="play">
            Spustit
          </Button>
          <Button intent="solid" icon="play">
            Spustit
          </Button>
          <Button intent="ghost" icon="edit">
            Edit raw
          </Button>
          <Button intent="approve" icon="check">
            Schválit
          </Button>
          <Button intent="reject" icon="x">
            Zamítnout
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          sizes
        </Typography>
        <div className="flex flex-wrap items-center gap-3">
          <Button intent="run" size="sm" icon="play">
            sm
          </Button>
          <Button intent="run" size="md" icon="play">
            md
          </Button>
          <Button intent="run" size="lg" icon="play">
            lg
          </Button>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
