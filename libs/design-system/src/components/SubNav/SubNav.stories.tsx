import type { Meta, StoryObj } from "@storybook/react";
import { SubNav } from "./SubNav";
import { Button } from "../Button/Button";

const items = [
  { href: "/departments/dev/overview", label: "Overview", active: true },
  { href: "/departments/dev/team", label: "Team", active: false },
  { href: "/departments/dev/pipelines", label: "Pipelines", active: false },
  { href: "/departments/dev/integrations", label: "Integrations", active: false },
];

const meta: Meta<typeof SubNav> = {
  title: "DesignSystem/SubNav",
  component: SubNav,
  parameters: { backgrounds: { default: "velin" } },
  args: { items },
};
export default meta;

type Story = StoryObj<typeof SubNav>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <SubNav items={items} />
      <SubNav
        actions={
          <Button intent="primary" size="sm">
            + New task
          </Button>
        }
        items={items}
      />
      {/* ZB-11 Settings sub-nav — a left column at ≥1024px, the same strip below it. */}
      <div className="max-w-[220px]">
        <SubNav items={items} orientation="responsive" />
      </div>
    </div>
  ),
};

export const Playground: Story = {};
