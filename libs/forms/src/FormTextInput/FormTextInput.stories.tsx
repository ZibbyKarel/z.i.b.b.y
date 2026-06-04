import type { Meta, StoryObj } from "@storybook/react"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { Stack } from "@zibby/design-system"
import { Form } from "../Form"
import { FormTextInput } from "./FormTextInput"

const meta: Meta<typeof FormTextInput> = {
  title: "Forms/FormTextInput",
  component: FormTextInput,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FormTextInput>

const schema = z.object({
  name: z.string().min(1, "Povinné pole"),
  email: z.string().email("Neplatný e-mail"),
})
type Schema = z.infer<typeof schema>

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{
        resolver: zodResolver(schema),
        defaultValues: { name: "", email: "" },
      }}
      onSubmit={(data) => alert(JSON.stringify(data))}
    >
      <Stack gap="200">
        <FormTextInput<Schema> label="Název" name="name" placeholder="Zadejte název…" />
        <FormTextInput<Schema>
          hint="Zadejte platný e-mail"
          label="E-mail"
          name="email"
          placeholder="name@example.com"
          type="email"
        />
        <button type="submit">Odeslat</button>
      </Stack>
    </Form>
  ),
}

export const Playground: Story = {
  args: { label: "Název", name: "name", hint: "Nápověda", placeholder: "Zadejte hodnotu…" },
  render: (args) => (
    <Form<{ name: string }>
      formOptions={{ defaultValues: { name: "" } }}
      onSubmit={() => {}}
    >
      <FormTextInput<{ name: string }> {...args} name="name" />
    </Form>
  ),
}
