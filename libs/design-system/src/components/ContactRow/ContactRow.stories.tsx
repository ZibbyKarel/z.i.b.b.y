import type { Meta, StoryObj } from "@storybook/react";
import { ContactRow } from "./ContactRow";

const meta: Meta<typeof ContactRow> = {
  title: "DesignSystem/ContactRow",
  component: ContactRow,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    name: "Jane Doe",
    sub: "Product Owner",
  },
};
export default meta;

type Story = StoryObj<typeof ContactRow>;

export const Overview: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col border border-line">
      <ContactRow name="Jane Doe" onRemove={() => {}} onToggleVip={() => {}} sub="Product Owner" />
      <ContactRow
        vip
        name="Marek Novák"
        onRemove={() => {}}
        onToggleVip={() => {}}
        sub="Engineering Lead"
      />
    </div>
  ),
};

export const Playground: Story = {};
