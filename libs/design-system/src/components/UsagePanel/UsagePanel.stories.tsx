import type { Meta, StoryObj } from "@storybook/react";
import { Stack } from "../Stack/Stack";
import { UsagePanel } from "./UsagePanel";

const meta: Meta<typeof UsagePanel> = {
  title: "DesignSystem/UsagePanel",
  component: UsagePanel,
  args: {},
};
export default meta;

type Story = StoryObj<typeof UsagePanel>;

export const Overview: Story = {
  render: () => (
    <div className="p-8">
      <Stack gap="300">
        <UsagePanel
          items={[
            { label: "5H", value: 39, resetsIn: "2h 22m" },
            { label: "WEEK", value: 37, resetsIn: "3d 6h" },
          ]}
        />
        <UsagePanel
          items={[
            { label: "5H", value: 82, resetsIn: "41m 10s" },
            { label: "WEEK", value: 94, resetsIn: "1d 2h" },
          ]}
        />
        <UsagePanel items={[{ label: "5H", value: 12 }]} />
      </Stack>
    </div>
  ),
};

export const Playground: Story = {
  args: {
    items: [
      { label: "5H", value: 39, resetsIn: "2h 22m" },
      { label: "WEEK", value: 37, resetsIn: "3d 6h" },
    ],
  },
};
