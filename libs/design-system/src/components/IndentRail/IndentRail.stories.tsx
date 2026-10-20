import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardContent } from "../Card/Card";
import { IndentRail } from "./IndentRail";

const meta: Meta<typeof IndentRail> = {
  title: "DesignSystem/IndentRail",
  component: IndentRail,
};
export default meta;

type Story = StoryObj<typeof IndentRail>;

export const Overview: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Card edge="ok">
        <CardContent>Parent PR</CardContent>
      </Card>
      <IndentRail>
        <div className="flex flex-col gap-2 pl-2">
          <Card edge="run">
            <CardContent>Stacked child 1</CardContent>
          </Card>
          <Card edge="neutral">
            <CardContent>Stacked child 2</CardContent>
          </Card>
        </div>
      </IndentRail>
    </div>
  ),
};

export const Playground: Story = {
  args: { children: <span>Nested content</span> },
};
