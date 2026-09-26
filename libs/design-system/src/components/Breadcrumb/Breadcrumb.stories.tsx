import type { Meta, StoryObj } from "@storybook/react";
import { Breadcrumb } from "./Breadcrumb";

const items = [
  { label: "Departments", href: "/departments" },
  { label: "Development", href: "/departments/dev" },
  { label: "APR-142" },
];

const meta: Meta<typeof Breadcrumb> = {
  title: "DesignSystem/Breadcrumb",
  component: Breadcrumb,
  parameters: { backgrounds: { default: "velin" } },
  args: { items },
};
export default meta;

type Story = StoryObj<typeof Breadcrumb>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={items} />
      <Breadcrumb items={[{ label: "System" }, { label: "Registries" }, { label: "Names" }]} />
    </div>
  ),
};

export const Playground: Story = {};
