import type { Meta, StoryObj } from "@storybook/react";
import { FilePreview } from "./FilePreview";

const meta: Meta<typeof FilePreview> = { title: "Components/FilePreview", component: FilePreview };
export default meta;
type Story = StoryObj<typeof FilePreview>;

export const Pdf: Story = { args: { name: "spec.pdf", size: 1_258_291, mediaType: "application/pdf" } };
export const Removable: Story = { args: { name: "data.csv", size: 49_152, onRemove: () => {} } };
export const Code: Story = { args: { name: "main.ts", size: 8_192 } };
