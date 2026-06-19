import type { Meta, StoryObj } from "@storybook/react";
import { Field, fieldControlClass } from "./Field";

const meta: Meta<typeof Field> = {
  title: "DesignSystem/Field/Field",
  component: Field,
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

type Story = StoryObj<typeof Field>;

const sampleInput = (props: { id: string; describedBy: string | undefined; invalid: boolean }) => (
  <input
    aria-describedby={props.describedBy}
    aria-invalid={props.invalid || undefined}
    className={fieldControlClass}
    id={props.id}
    placeholder="…"
  />
);

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Field label="Column layout (default)">{sampleInput}</Field>
      <Field hint="Nápověda pod polem" label="With hint">
        {sampleInput}
      </Field>
      <Field error="Toto pole je povinné" label="With error">
        {sampleInput}
      </Field>
    </div>
  ),
};

export const Playground: Story = {
  args: { label: "Název", hint: "Nápověda k poli" },
  render: (args) => <Field {...args}>{sampleInput}</Field>,
};
