import type { Meta, StoryObj } from "@storybook/react";
import { FilePickerField } from "./FilePickerField";

const meta = {
  title: "DesignSystem/Field/FilePickerField",
  component: FilePickerField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilePickerField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Dokument",
    hint: "PDF nebo DOCX",
  },
};

export const WithError: Story = {
  args: {
    label: "Dokument",
    error: "Soubor je povinný",
  },
};

export const Multiple: Story = {
  args: {
    label: "Přílohy",
    hint: "Vyberte jeden nebo více souborů",
    multiple: true,
  },
};

export const Directory: Story = {
  args: {
    label: "Složka projektu",
    hint: "Vyberte celou složku",
    directory: true,
  },
};

export const AcceptImages: Story = {
  args: {
    label: "Obrázek",
    hint: "PNG nebo JPG",
    accept: "image/png,image/jpeg",
  },
};
