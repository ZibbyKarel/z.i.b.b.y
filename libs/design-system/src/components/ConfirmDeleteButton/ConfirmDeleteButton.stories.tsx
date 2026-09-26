import type { Meta, StoryObj } from "@storybook/react";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

const meta: Meta<typeof ConfirmDeleteButton> = {
  title: "DesignSystem/ConfirmDeleteButton",
  component: ConfirmDeleteButton,
  args: {},
};
export default meta;

type Story = StoryObj<typeof ConfirmDeleteButton>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6 p-8">
      <ConfirmDeleteButton onConfirm={() => {}} />
      <ConfirmDeleteButton
        confirmLabel="Really remove company?"
        label="Remove company"
        onConfirm={() => {}}
      />
      <ConfirmDeleteButton disabled onConfirm={() => {}} />
    </div>
  ),
};

export const Playground: Story = {
  args: { label: "Delete", confirmLabel: "Confirm delete" },
};
