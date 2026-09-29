import type { Meta, StoryObj } from "@storybook/react";
import { STATE_ORDER } from "../../stateTone";
import { Typography } from "../Typography/Typography";
import { ZibbyAvatar, type ZibbyAvatarSize } from "./ZibbyAvatar";

const meta: Meta<typeof ZibbyAvatar> = {
  title: "DesignSystem/ZibbyAvatar",
  component: ZibbyAvatar,
  args: { state: "working", size: 112, animate: true },
  argTypes: {
    state: { control: "select", options: STATE_ORDER },
    size: { control: "select", options: [16, 24, 32, 112] },
  },
};
export default meta;

type Story = StoryObj<typeof ZibbyAvatar>;

const SIZES: ZibbyAvatarSize[] = [112, 32, 24, 16];

function StateRow({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className="rounded-lg border border-border bg-background p-6" data-theme={theme}>
      <div className="flex items-center gap-6">
        {STATE_ORDER.map((state) => (
          <div className="flex flex-col items-center gap-2" key={state}>
            <ZibbyAvatar size={32} state={state} />
            <Typography type="micro">{state}</Typography>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-12">
      <div className="flex flex-col gap-3">
        <Typography type="label">6 states × light/dark</Typography>
        <StateRow theme="light" />
        <StateRow theme="dark" />
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">every sanctioned size</Typography>
        <div className="flex items-end gap-6">
          {SIZES.map((size) => (
            <div className="flex flex-col items-center gap-2" key={size}>
              <ZibbyAvatar animate={size >= 32} size={size} state="working" />
              <Typography type="micro">{size}px</Typography>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
