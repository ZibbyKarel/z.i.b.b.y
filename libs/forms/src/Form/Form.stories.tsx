import type { Meta, StoryObj } from "@storybook/react";
import { zodResolver } from "../zodResolver";
import { z } from "zod";
import { Stack } from "@zibby/design-system";
import { Form } from "./Form";
import { FormTextInput } from "../FormTextInput";
import { FormTextArea } from "../FormTextArea";
import { FormToggle } from "../FormToggle";

const meta: Meta<typeof Form> = {
  title: "Forms/Form",
  component: Form,
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

type Story = StoryObj<typeof Form>;

const schema = z.object({
  name: z.string().min(1, "Povinné pole"),
  description: z.string().min(10, "Alespoň 10 znaků"),
  active: z.boolean(),
});
type Schema = z.infer<typeof schema>;

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{
        resolver: zodResolver(schema),
        defaultValues: { name: "", description: "", active: false },
      }}
      onSubmit={(data) => alert(JSON.stringify(data, null, 2))}
    >
      <Stack gap="200">
        <FormTextInput<Schema> label="Název" name="name" placeholder="Zadejte název…" />
        <FormTextArea<Schema>
          hint="Alespoň 10 znaků"
          label="Popis"
          name="description"
          placeholder="Popište…"
        />
        <FormToggle<Schema> label="Aktivní" name="active" />
        <button type="submit">Odeslat</button>
      </Stack>
    </Form>
  ),
};
