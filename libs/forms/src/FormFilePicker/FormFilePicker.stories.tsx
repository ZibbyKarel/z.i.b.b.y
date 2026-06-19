import type { Meta, StoryObj } from "@storybook/react";
import { zodResolver } from "../zodResolver";
import { z } from "zod";
import { Stack } from "@zibby/design-system";
import { Form } from "../Form";
import { FormFilePicker } from "./FormFilePicker";

const meta: Meta<typeof FormFilePicker> = {
  title: "Forms/FormFilePicker",
  component: FormFilePicker,
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

type Story = StoryObj<typeof FormFilePicker>;

const schema = z.object({ files: z.array(z.instanceof(File)).min(1, "Soubor je povinný") });
type Schema = z.infer<typeof schema>;

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{
        resolver: zodResolver(schema),
        defaultValues: { files: [] },
      }}
      onSubmit={(data) => alert(`${data.files.length} souborů`)}
    >
      <Stack gap="200">
        <FormFilePicker<Schema> hint="PDF nebo DOCX" label="Dokument" name="files" />
        <FormFilePicker<Schema> multiple label="Přílohy" name="files" />
        <button type="submit">Odeslat</button>
      </Stack>
    </Form>
  ),
};

export const Playground: Story = {
  args: { label: "Dokument", name: "files", hint: "PDF nebo DOCX" },
  render: (args) => (
    <Form<{ files: File[] }> formOptions={{ defaultValues: { files: [] } }} onSubmit={() => {}}>
      <FormFilePicker<{ files: File[] }> {...args} name="files" />
    </Form>
  ),
};
