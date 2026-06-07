import type { Meta, StoryObj } from "@storybook/react";
import { DropZoneField } from "./DropZoneField";

const meta = {
  title: "DesignSystem/Field/DropZoneField",
  component: DropZoneField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DropZoneField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Přílohy",
    hint: "PDF, DOCX nebo obrázky",
    onDrop: (files) => console.log("dropped", files),
  },
};

export const WithError: Story = {
  args: {
    label: "Přílohy",
    error: "Nahrajte alespoň jeden soubor",
    onDrop: (files) => console.log("dropped", files),
  },
};

export const Disabled: Story = {
  args: {
    label: "Přílohy",
    hint: "Nahrávání není k dispozici",
    disabled: true,
    onDrop: (files) => console.log("dropped", files),
  },
};
