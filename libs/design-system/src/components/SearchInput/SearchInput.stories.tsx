import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SearchInput } from "./SearchInput";

const meta: Meta<typeof SearchInput> = {
  title: "DesignSystem/SearchInput",
  component: SearchInput,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    ariaLabel: "Search",
    placeholder: "Search the archive…",
  },
};
export default meta;

type Story = StoryObj<typeof SearchInput>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-4" style={{ width: 320, maxWidth: "100%" }}>
      <SearchInput ariaLabel="Search" onChange={() => {}} placeholder="Search…" value="" />
      <SearchInput ariaLabel="Search" onChange={() => {}} placeholder="Search…" value="filled in" />
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => {
    function Controlled() {
      const [value, setValue] = useState("");
      return (
        <div style={{ width: 320, maxWidth: "100%" }}>
          <SearchInput {...args} onChange={(e) => setValue(e.target.value)} value={value} />
        </div>
      );
    }
    return <Controlled />;
  },
};
