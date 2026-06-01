import type { Meta, StoryObj } from "@storybook/react";
import { Spacer } from "./Spacer";
import { Spacing } from "../../tokens";

const meta: Meta<typeof Spacer> = {
  title: "Primitives/Spacer",
  component: Spacer,
  parameters: { backgrounds: { default: "velin" } },
  args: { size: "200" },
};
export default meta;

type Story = StoryObj<typeof Spacer>;

const sizes: Spacing[] = ["50", "100", "150", "200", "250", "300"];

export const VerticalGap: Story = {
  render: () => (
    <div className="flex flex-col">
      {sizes.map((size) => (
        <div key={size} className="flex items-center gap-4">
          <span className="w-12 font-mono text-xs text-foreground-faint">{size}</span>
          <div className="flex flex-col">
            <div className="h-px w-24 bg-border" />
            <Spacer size={size} axis="y" />
            <div className="h-px w-24 bg-border" />
          </div>
        </div>
      ))}
    </div>
  ),
};

export const FlexGrow: Story = {
  render: () => (
    <div className="flex h-8 w-full items-center border border-border px-3">
      <span className="font-mono text-sm text-foreground-dim">Vlevo</span>
      <Spacer grow />
      <span className="font-mono text-sm text-foreground-dim">Vpravo</span>
    </div>
  ),
};

export const Playground: Story = {};
