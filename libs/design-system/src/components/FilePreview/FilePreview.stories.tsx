import type { Meta, StoryObj } from "@storybook/react";
import { FilePreview } from "./FilePreview";

const meta: Meta<typeof FilePreview> = {
  title: "DesignSystem/FilePreview",
  component: FilePreview,
  parameters: { backgrounds: { default: "velin" } },
  args: { name: "main.ts", size: 8_192 },
};
export default meta;

type Story = StoryObj<typeof FilePreview>;

export const Overview: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-sm text-foreground-dim">code file</span>
        <FilePreview name="main.ts" size={8_192} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-sm text-foreground-dim">pdf document</span>
        <FilePreview mediaType="application/pdf" name="spec.pdf" size={1_258_291} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-sm text-foreground-dim">removable, with size</span>
        <FilePreview name="data.csv" onRemove={() => {}} size={49_152} />
      </div>
    </div>
  ),
};

export const Playground: Story = {};
