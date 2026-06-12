import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { type Schedule, SchedulePicker } from "./SchedulePicker";

const meta: Meta<typeof SchedulePicker> = {
  title: "DesignSystem/Field/SchedulePicker",
  component: SchedulePicker,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof SchedulePicker>;

const WEEKLY: Schedule = { repeat: "weekly", time: "07:00", weekdays: [1, 3, 5], monthDay: 1 };

export const Overview: Story = {
  render: () => {
    const [weekly, setWeekly] = useState<Schedule>(WEEKLY);
    const [monthly, setMonthly] = useState<Schedule>({
      ...WEEKLY,
      repeat: "monthly",
      monthDay: 15,
    });
    return (
      <div className="flex flex-col gap-6">
        <SchedulePicker onValueChange={setWeekly} value={weekly} />
        <SchedulePicker onValueChange={setMonthly} value={monthly} />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<Schedule>(WEEKLY);
    return <SchedulePicker {...args} onValueChange={setValue} value={value} />;
  },
};
