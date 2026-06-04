import type { Meta, StoryObj } from "@storybook/react"
import { Stack } from "@zibby/design-system"
import { Form } from "../Form"
import { FormMarkdownEditor } from "./FormMarkdownEditor"

const meta: Meta<typeof FormMarkdownEditor> = {
  title: "Forms/FormMarkdownEditor",
  component: FormMarkdownEditor,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FormMarkdownEditor>

const SAMPLE = "# Nadpis\n\nTento text je **tučný** a _kurzíva_."

export const Overview: Story = {
  render: () => (
    <Form<{ body: string }>
      formOptions={{ defaultValues: { body: SAMPLE } }}
      onSubmit={(data) => alert(JSON.stringify(data))}
    >
      <Stack gap="200">
        <FormMarkdownEditor<{ body: string }>
          hint="Markdown je podporován"
          label="Obsah"
          name="body"
        />
        <button type="submit">Uložit</button>
      </Stack>
    </Form>
  ),
}

export const Playground: Story = {
  args: { label: "Obsah", name: "body", hint: "Markdown je podporován" },
  render: (args) => (
    <Form<{ body: string }>
      formOptions={{ defaultValues: { body: "" } }}
      onSubmit={() => {}}
    >
      <FormMarkdownEditor<{ body: string }> {...args} name="body" />
    </Form>
  ),
}
