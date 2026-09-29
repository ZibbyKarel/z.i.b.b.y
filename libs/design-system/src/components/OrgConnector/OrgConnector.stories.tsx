import type { Meta, StoryObj } from "@storybook/react";
import { OrgConnector } from "./OrgConnector";

const meta: Meta<typeof OrgConnector> = {
  title: "DesignSystem/OrgConnector",
  component: OrgConnector,
  args: {},
};
export default meta;

type Story = StoryObj<typeof OrgConnector>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-1 p-8">
      <OrgConnector length={22} orientation="vertical" />
      <div className="h-6 w-24 border border-border bg-surface-panel" />
      <OrgConnector length={18} orientation="vertical" />
      <div className="h-16 w-24 border border-ink bg-surface-panel" />
      <OrgConnector active length={22} orientation="vertical" />
      <OrgConnector hidden length={22} orientation="vertical" />
    </div>
  ),
};

export const Playground: Story = {
  args: { orientation: "vertical", length: 22 },
};
