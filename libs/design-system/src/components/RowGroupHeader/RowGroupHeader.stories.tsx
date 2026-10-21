import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { RowGroupHeader } from "./RowGroupHeader";

const meta: Meta<typeof RowGroupHeader> = {
  title: "DesignSystem/RowGroupHeader",
  component: RowGroupHeader,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    title: "Checkout rework",
    groupKey: "EP-12",
    count: "02/05",
    progress: 40,
    closed: false,
    onToggle: () => {},
  },
  decorators: [(Story) => <div className="w-[420px] bg-panel">{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof RowGroupHeader>;

export const Overview: Story = {
  render: () => {
    const Demo = () => {
      const [closed, setClosed] = useState(false);
      return (
        <RowGroupHeader
          closed={closed}
          count="02/05"
          groupKey="EP-12"
          onToggle={() => setClosed((c) => !c)}
          progress={40}
          title="Checkout rework"
        />
      );
    };
    return <Demo />;
  },
};
export const Playground: Story = {};
