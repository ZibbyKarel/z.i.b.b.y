import type { Meta, StoryObj } from "@storybook/react";
import { Icon, iconNames } from "./Icon";

const meta: Meta<typeof Icon> = {
  title: "DesignSystem/Icon",
  component: Icon,
  parameters: { backgrounds: { default: "velin" } },
  args: { name: "spark", size: "xl", stroke: "default" },
};
export default meta;

type Story = StoryObj<typeof Icon>;

export const Overview: Story = {
  render: () => (
    <div className="grid grid-cols-8 gap-4 text-foreground">
      {iconNames.map((name) => (
        <div
          className="flex flex-col items-center gap-2 rounded border border-border p-3"
          key={name}
        >
          <Icon name={name} size="lg" />
          <span className="font-mono text-2xs text-foreground-faint">
            {name}
          </span>
        </div>
      ))}
    </div>
  ),
};

export const Playground: Story = {};
