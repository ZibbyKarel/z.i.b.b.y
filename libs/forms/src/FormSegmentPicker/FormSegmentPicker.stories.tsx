import type { Meta, StoryObj } from "@storybook/react"
import { zodResolver } from "../zodResolver"
import { z } from "zod"
import { Stack } from "@zibby/design-system"
import { Form } from "../Form"
import { FormSegmentPicker } from "./FormSegmentPicker"

const periodOptions = [
  { value: "day", label: "Den" },
  { value: "week", label: "Týden" },
  { value: "month", label: "Měsíc" },
]

const meta: Meta<typeof FormSegmentPicker> = {
  title: "Forms/FormSegmentPicker",
  component: FormSegmentPicker,
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

type Story = StoryObj<typeof FormSegmentPicker>

const schema = z.object({ period: z.string().min(1, "Vyberte období") })
type Schema = z.infer<typeof schema>

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{
        resolver: zodResolver(schema),
        defaultValues: { period: "week" },
      }}
      onSubmit={(data) => alert(JSON.stringify(data))}
    >
      <Stack gap="200">
        <FormSegmentPicker<Schema>
          hint="Vyberte časové okno"
          label="Období"
          name="period"
          options={periodOptions}
        />
        <button type="submit">Odeslat</button>
      </Stack>
    </Form>
  ),
}

export const Playground: Story = {
  args: { label: "Období", name: "period", hint: "Nápověda", options: periodOptions },
  render: (args) => (
    <Form<{ period: string }>
      formOptions={{ defaultValues: { period: "" } }}
      onSubmit={() => {}}
    >
      <FormSegmentPicker<{ period: string }> {...args} name="period" />
    </Form>
  ),
}
