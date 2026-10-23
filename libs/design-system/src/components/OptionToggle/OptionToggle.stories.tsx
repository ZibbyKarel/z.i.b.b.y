import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { OptionToggle, type OptionToggleOption } from "./OptionToggle";

type Gate = "auto" | "ask" | "silent";

const gateOptions: OptionToggleOption<Gate>[] = [
  { id: "auto", label: "Auto" },
  { id: "ask", label: "Ask" },
  { id: "silent", label: "Silent" },
];

const meta: Meta<typeof OptionToggle> = {
  title: "DesignSystem/OptionToggle",
  component: OptionToggle,
};
export default meta;

type Story = StoryObj<typeof OptionToggle>;

function Controlled() {
  const [value, setValue] = useState<Gate>("ask");
  return (
    <OptionToggle ariaLabel="Gate mode" onChange={setValue} options={gateOptions} value={value} />
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <Controlled />
      <OptionToggle ariaLabel="Gate mode (read-only)" options={gateOptions} value="auto" />
      <OptionToggle
        ariaLabel="Scope"
        options={[
          { id: "mine", label: "Mine" },
          { id: "all", label: "All" },
        ]}
        value="mine"
      />
    </div>
  ),
};

export const Playground: Story = {
  render: () => <Controlled />,
};
