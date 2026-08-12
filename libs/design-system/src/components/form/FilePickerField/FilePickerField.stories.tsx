import type { Meta, StoryObj } from "@storybook/react";
import { FilePickerField } from "./FilePickerField";

const meta: Meta<typeof FilePickerField> = {
  title: "DesignSystem/Field/FilePickerField",
  component: FilePickerField,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FilePickerField>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <FilePickerField hint="PDF nebo DOCX" label="Dokument" />
      <FilePickerField error="Soubor je povinný" label="Dokument" />
      <FilePickerField multiple hint="Vyberte jeden nebo více souborů" label="Přílohy" />
      <FilePickerField directory hint="Vyberte celou složku" label="Složka projektu" />
      <FilePickerField accept="image/png,image/jpeg" hint="PNG nebo JPG" label="Obrázek" />
    </div>
  ),
};

export const Playground: Story = {
  args: { label: "Dokument", hint: "PDF nebo DOCX" },
};
