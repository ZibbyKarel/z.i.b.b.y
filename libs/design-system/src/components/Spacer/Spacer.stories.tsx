import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Spacer } from "./Spacer";
import { type Spacing } from "../../tokens";

const meta: Meta<typeof Spacer> = {
  title: "Components/Spacer",
  component: Spacer,
  parameters: { backgrounds: { default: "velin" } },
  args: { size: "200" },
};
export default meta;

type Story = StoryObj<typeof Spacer>;

const sizes: Spacing[] = ["50", "100", "150", "200", "250", "300"];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          fixed vertical gap
        </Typography>
        <div className="flex flex-col gap-1">
          {sizes.map((size) => (
            <div className="flex items-center gap-4" key={size}>
              <span className="w-12 font-mono text-xs text-foreground-faint">
                {size}
              </span>
              <div className="flex flex-col">
                <div className="h-px w-24 bg-border" />
                <Spacer axis="y" size={size} />
                <div className="h-px w-24 bg-border" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          flex grow
        </Typography>
        <div className="flex h-8 w-full items-center border border-border px-3">
          <span className="font-mono text-sm text-foreground-dim">Vlevo</span>
          <Spacer grow />
          <span className="font-mono text-sm text-foreground-dim">Vpravo</span>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
