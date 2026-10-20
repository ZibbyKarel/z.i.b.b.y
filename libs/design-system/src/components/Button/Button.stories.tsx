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
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: { control: "select", options: ["sm", "md"] },
  },
  args: { children: "Spustit", intent: "primary", size: "md" },
};
export default meta;

type Story = StoryObj<typeof Button>;

const intents = ["primary", "secondary", "ghost", "danger"] as const;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {(["md", "sm"] as const).map((size) => (
        <div className="flex flex-col gap-2" key={size}>
          <Typography type="label">{`variants — ${size}`}</Typography>
          <div className="flex flex-wrap items-center gap-3">
            <Button intent="primary" size={size}>
              Re-run
            </Button>
            <Button intent="secondary" size={size}>
              Pause
            </Button>
            <Button intent="ghost" size={size}>
              Open
            </Button>
            <Button intent="danger" size={size}>
              Stop
            </Button>
            <Button icon="play" intent="primary" size={size}>
              Run
            </Button>
            <Button aria-label="Next" icon="arrow" intent="secondary" size={size} />
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Typography type="label">loading</Typography>
        <div className="flex flex-wrap items-center gap-3">
          {intents.map((intent) => (
            <Button loading intent={intent} key={intent}>
              {intent}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">disabled — inert across every intent, not a faded fill</Typography>
        <div className="flex flex-wrap items-center gap-3">
          {intents.map((intent) => (
            <Button disabled intent={intent} key={intent}>
              {intent}
            </Button>
          ))}
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
