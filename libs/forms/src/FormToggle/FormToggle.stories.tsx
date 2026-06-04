import type { Meta, StoryObj } from "@storybook/react"
import { Stack } from "@zibby/design-system"
import { Form } from "../Form"
import { FormToggle } from "./FormToggle"

const meta: Meta<typeof FormToggle> = {
  title: "Forms/FormToggle",
  component: FormToggle,
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

type Story = StoryObj<typeof FormToggle>

type Schema = { active: boolean; notify: boolean }

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{ defaultValues: { active: true, notify: false } }}
      onSubmit={(data) => alert(JSON.stringify(data))}
    >
      <Stack gap="200">
        <FormToggle<Schema> label="Aktivní" name="active" />
        <FormToggle<Schema>
          hint="Posílat notifikace e-mailem"
          label="Notifikace"
          name="notify"
        />
        <FormToggle<Schema> disabled label="Zakázáno" name="active" />
        <button type="submit">Uložit</button>
      </Stack>
    </Form>
  ),
}

export const Playground: Story = {
  args: { label: "Aktivní", name: "active", hint: "Nápověda" },
  render: (args) => (
    <Form<{ active: boolean }>
      formOptions={{ defaultValues: { active: false } }}
      onSubmit={() => {}}
    >
      <FormToggle<{ active: boolean }> {...args} name="active" />
    </Form>
  ),
}
