import type { Meta, StoryObj } from "@storybook/react";
import { MenuSurface } from "./MenuSurface";

const meta: Meta<typeof MenuSurface> = {
  title: "DesignSystem/MenuSurface",
  component: MenuSurface,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    align: { control: "radio", options: ["stretch", "end"] },
    scroll: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="relative h-72 w-80">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MenuSurface>;

const Rows = () => (
  <div className="p-1">
    {["First option", "Second option", "Third option"].map((label) => (
      <div
        className="rounded-sm px-[11px] py-[9px] text-md text-foreground hover:bg-surface"
        key={label}
      >
        {label}
      </div>
    ))}
  </div>
);

export const Overview: Story = {
  render: () => (
    <div className="flex gap-16">
      <div className="relative w-64">
        <MenuSurface align="stretch">
          <Rows />
        </MenuSurface>
      </div>
      <div className="relative w-40">
        <MenuSurface align="end">
          <Rows />
        </MenuSurface>
      </div>
    </div>
  ),
};

export const Playground: Story = {
  args: { align: "stretch", scroll: false },
  render: (args) => (
    <MenuSurface {...args}>
      <Rows />
    </MenuSurface>
  ),
};
