import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { Density } from "../../tokens";
import { DensityMenu } from "./DensityMenu";

const meta: Meta<typeof DensityMenu> = {
  title: "DesignSystem/DensityMenu",
  component: DensityMenu,
};
export default meta;

type Story = StoryObj<typeof DensityMenu>;

export const Overview: Story = {
  render: () => {
    const [value, setValue] = useState<Density>("airy");
    return (
      <div className="flex h-[240px] justify-end p-4">
        <DensityMenu
          label="Density"
          labels={{ compact: "COMPACT", comfort: "COMFORT", airy: "AIRY", open: "OPEN" }}
          onChange={setValue}
          value={value}
        />
      </div>
    );
  },
};
