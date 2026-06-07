import type { Meta, StoryObj } from "@storybook/react"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { Form } from "../Form"
import { FormDropZone } from "./FormDropZone"

const meta: Meta<typeof FormDropZone> = {
  title: "Forms/FormDropZone",
  component: FormDropZone,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-120">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FormDropZone>

const schema = z.object({ files: z.array(z.instanceof(File)).min(1, "Nahrajte alespoň jeden soubor") })
type Schema = z.infer<typeof schema>

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{
        resolver: zodResolver(schema),
        defaultValues: { files: [] },
      }}
      onSubmit={(data) => alert(`${data.files.length} souborů`)}
    >
      <FormDropZone<Schema> hint="PDF nebo obrázky" label="Přílohy" name="files" />
      <button type="submit">Odeslat</button>
    </Form>
  ),
}

export const Playground: Story = {
  args: { label: "Přílohy", name: "files", hint: "Přetáhněte soubory sem" },
  render: (args) => (
    <Form<{ files: File[] }>
      formOptions={{ defaultValues: { files: [] } }}
      onSubmit={() => {}}
    >
      <FormDropZone<{ files: File[] }> {...args} name="files" />
    </Form>
  ),
}
