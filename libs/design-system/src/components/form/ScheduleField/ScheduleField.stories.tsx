import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { Schedule } from "../SchedulePicker/SchedulePicker";
import { ScheduleField } from "./ScheduleField";

const meta: Meta<typeof ScheduleField> = {
  title: "DesignSystem/Field/ScheduleField",
  component: ScheduleField,
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

type Story = StoryObj<typeof ScheduleField>;

const WEEKLY: Schedule = { repeat: "weekly", time: "07:00", weekdays: [1, 3, 5], monthDay: 1 };

export const Overview: Story = {
  render: () => {
    const [a, setA] = useState<Schedule>(WEEKLY);
    const [b, setB] = useState<Schedule>({ ...WEEKLY, repeat: "monthly", monthDay: 15 });
    return (
      <div className="flex flex-col gap-6">
        <ScheduleField label="Schedule" onValueChange={setA} value={a} />
        <ScheduleField
          error="Pick a time"
          label="With error"
          onValueChange={setB}
          value={b}
        />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<Schedule>(WEEKLY);
    return <ScheduleField {...args} onValueChange={setValue} value={value} />;
  },
  args: { label: "Schedule", hint: "When the automation fires" },
};
