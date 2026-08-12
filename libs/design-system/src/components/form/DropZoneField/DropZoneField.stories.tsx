import type { Meta, StoryObj } from "@storybook/react";
import { DropZoneField } from "./DropZoneField";

const meta: Meta<typeof DropZoneField> = {
  title: "DesignSystem/Field/DropZoneField",
  component: DropZoneField,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
  args: { onDrop: (files) => console.log("dropped", files) },
};
export default meta;

type Story = StoryObj<typeof DropZoneField>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <DropZoneField
        hint="PDF, DOCX nebo obrázky"
        label="Přílohy"
        onDrop={(files) => console.log("dropped", files)}
      />
      <DropZoneField
        error="Nahrajte alespoň jeden soubor"
        label="Přílohy"
        onDrop={(files) => console.log("dropped", files)}
      />
      <DropZoneField
        disabled
        hint="Nahrávání není k dispozici"
        label="Přílohy"
        onDrop={(files) => console.log("dropped", files)}
      />
    </div>
  ),
};

export const Playground: Story = {
  args: { label: "Přílohy", hint: "PDF, DOCX nebo obrázky" },
};
