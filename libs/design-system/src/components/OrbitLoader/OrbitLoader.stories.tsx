import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { OrbitLoader } from "./OrbitLoader";

const meta: Meta<typeof OrbitLoader> = {
  title: "DesignSystem/OrbitLoader",
  component: OrbitLoader,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
  args: { size: "md", label: "Načítám…" },
};
export default meta;

type Story = StoryObj<typeof OrbitLoader>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Typography type="label">sizes</Typography>
        <div className="flex items-end gap-10">
          <OrbitLoader size="sm" />
          <OrbitLoader size="md" />
          <OrbitLoader size="lg" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">with label</Typography>
        <div className="flex items-start gap-10">
          <OrbitLoader label="Loading…" size="sm" />
          <OrbitLoader label="Načítám…" size="md" />
          <OrbitLoader label="Loading graph…" size="lg" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
