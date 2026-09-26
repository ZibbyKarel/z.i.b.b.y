import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { GraphInlineInput } from "./GraphInlineInput";

const meta: Meta<typeof GraphInlineInput> = {
  title: "DesignSystem/Graph/GraphInlineInput",
  component: GraphInlineInput,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof GraphInlineInput>;

export const Overview: Story = {
  render: () => {
    function Demo() {
      const [file, setFile] = useState("report.md");
      const [name, setName] = useState("Nová pipeline");
      return (
        <div className="flex flex-col gap-4">
          <GraphInlineInput
            aria-label="Output file"
            onChange={(e) => setFile(e.target.value)}
            size={Math.max(file.length, 6)}
            value={file}
          />
          <GraphInlineInput
            aria-label="Pipeline name"
            onChange={(e) => setName(e.target.value)}
            value={name}
            variant="field"
            weight="bold"
          />
          <GraphInlineInput
            aria-label="Pipeline description"
            onChange={() => {}}
            value="Popis pipeline"
            variant="field"
          />
        </div>
      );
    }
    return <Demo />;
  },
};

export const Playground: Story = {
  argTypes: {
    variant: { control: "select", options: ["ghost", "field"] },
    weight: { control: "select", options: ["normal", "bold"] },
  },
  args: {
    "aria-label": "Output file",
    value: "report.md",
    variant: "ghost",
    weight: "normal",
  },
};
