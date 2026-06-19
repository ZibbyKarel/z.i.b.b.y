import type { Meta, StoryObj } from "@storybook/react";
import { zodResolver } from "../zodResolver";
import { z } from "zod";
import { Stack } from "@zibby/design-system";
import { Form } from "../Form";
import { FormTextArea } from "./FormTextArea";

const meta: Meta<typeof FormTextArea> = {
  title: "Forms/FormTextArea",
  component: FormTextArea,
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

type Story = StoryObj<typeof FormTextArea>;

const schema = z.object({ body: z.string().min(10, "Alespoň 10 znaků") });
type Schema = z.infer<typeof schema>;

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{
        resolver: zodResolver(schema),
        defaultValues: { body: "" },
      }}
      onSubmit={(data) => alert(JSON.stringify(data))}
    >
      <Stack gap="200">
        <FormTextArea<Schema>
          hint="Alespoň 10 znaků"
          label="Popis"
          name="body"
          placeholder="Napište popis…"
        />
        <button type="submit">Odeslat</button>
      </Stack>
    </Form>
  ),
};

export const Playground: Story = {
  args: { label: "Popis", name: "body", hint: "Nápověda", placeholder: "Napište…" },
  render: (args) => (
    <Form<{ body: string }> formOptions={{ defaultValues: { body: "" } }} onSubmit={() => {}}>
      <FormTextArea<{ body: string }> {...args} name="body" />
    </Form>
  ),
};
