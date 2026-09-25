import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "DesignSystem/EmptyState",
  component: EmptyState,
  args: {},
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-8 p-8">
      <EmptyState title="Nothing matches yet." />
      <EmptyState body="New events appear here as they stream in." title="The queue is empty." />
      <EmptyState
        action={<Button intent="primary">New task</Button>}
        body="Hand the first piece of work to the company."
        title="No tasks yet"
      />
    </div>
  ),
};

export const Playground: Story = {
  args: { title: "No tasks match these filters." },
};
