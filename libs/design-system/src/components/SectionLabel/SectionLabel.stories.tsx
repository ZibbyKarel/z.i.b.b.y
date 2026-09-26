import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../Button/Button";
import { SectionLabel } from "./SectionLabel";

const meta: Meta<typeof SectionLabel> = {
  title: "DesignSystem/SectionLabel",
  component: SectionLabel,
  args: {},
};
export default meta;

type Story = StoryObj<typeof SectionLabel>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-8">
      <SectionLabel>Org map</SectionLabel>
      <SectionLabel index={2}>Department · DEV</SectionLabel>
      <SectionLabel
        action={
          <Button intent="ghost" size="sm">
            Clear filters
          </Button>
        }
        index={1}
      >
        Fixed floor
      </SectionLabel>
    </div>
  ),
};

export const Playground: Story = {
  args: { index: 1, children: "Org map" },
};
