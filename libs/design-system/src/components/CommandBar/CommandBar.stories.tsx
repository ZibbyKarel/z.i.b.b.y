import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../Button/Button";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import { CommandBar, CommandBarGroup, CommandBarText } from "./CommandBar";

const meta: Meta<typeof CommandBar> = {
  title: "DesignSystem/CommandBar",
  component: CommandBar,
  parameters: { layout: "fullscreen" },
  args: { title: "ZIBBYCORP", subtitle: "/ BRIDGE" },
};
export default meta;

type Story = StoryObj<typeof CommandBar>;

export const Overview: Story = {
  render: (args) => (
    <CommandBar {...args}>
      <CommandBarGroup>
        <CommandBarText faint>LAYOUT</CommandBarText>
        <SegmentedControl
          items={[
            { value: "default", label: "DEFAULT" },
            { value: "review", label: "REVIEW" },
          ]}
          onChange={() => {}}
          value="default"
        />
      </CommandBarGroup>
      <Button intent="outline" size="sm">
        EDIT LAYOUT
      </Button>
      <CommandBarText>THU 24 SEP · 14:32</CommandBarText>
    </CommandBar>
  ),
};
