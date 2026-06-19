import type { Meta, StoryObj } from "@storybook/react";
import { zodResolver } from "../zodResolver";
import { z } from "zod";
import { Stack } from "@zibby/design-system";
import { Form } from "../Form";
import { FormSelect } from "./FormSelect";

const options = [
  { value: "cs", label: "Čeština" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

const meta: Meta<typeof FormSelect> = {
  title: "Forms/FormSelect",
  component: FormSelect,
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

type Story = StoryObj<typeof FormSelect>;

const schema = z.object({ lang: z.string().min(1, "Vyberte jazyk") });
type Schema = z.infer<typeof schema>;

export const Overview: Story = {
  render: () => (
    <Form<Schema>
      formOptions={{
        resolver: zodResolver(schema),
        defaultValues: { lang: "" },
      }}
      onSubmit={(data) => alert(JSON.stringify(data))}
    >
      <Stack gap="200">
        <FormSelect<string, Schema> label="Jazyk" name="lang" options={options} />
        <FormSelect<string, Schema>
          hint="Výchozí hodnota"
          label="S výchozí hodnotou"
          name="lang"
          options={options}
        />
        <button type="submit">Odeslat</button>
      </Stack>
    </Form>
  ),
};

export const Playground: Story = {
  args: { label: "Jazyk", name: "lang", hint: "Nápověda", options },
  render: (args) => (
    <Form<{ lang: string }> formOptions={{ defaultValues: { lang: "" } }} onSubmit={() => {}}>
      <FormSelect<string, { lang: string }> {...args} name="lang" />
    </Form>
  ),
};
