import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Dropdown } from "./Dropdown";

const LANG_OPTIONS = [
  { value: "cs", label: "Čeština", code: "CZ" },
  { value: "en", label: "English", code: "EN" },
];

const meta: Meta<typeof Dropdown> = {
  title: "DesignSystem/Dropdown",
  component: Dropdown,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Dropdown>;

export const Languages: Story = {
  render: () => {
    const [value, setValue] = useState("cs");
    return (
      <div className="flex justify-end p-4">
        <Dropdown
          aria-label="Jazyk rozhraní"
          onChange={setValue}
          options={LANG_OPTIONS}
          value={value}
        />
      </div>
    );
  },
};

export const SmallInline: Story = {
  render: () => {
    const [value, setValue] = useState("cs");
    return (
      <div className="flex justify-end p-4">
        <Dropdown
          aria-label="Jazyk rozhraní"
          onChange={setValue}
          options={LANG_OPTIONS}
          size="sm"
          value={value}
        />
      </div>
    );
  },
};

export const FieldVariant: Story = {
  render: () => {
    const [value, setValue] = useState("opus");
    return (
      <div className="w-80 p-4">
        <Dropdown
          aria-label="Model"
          onChange={setValue}
          options={[
            { value: "opus", label: "opus" },
            { value: "sonnet", label: "sonnet" },
            { value: "haiku", label: "haiku" },
          ]}
          value={value}
          variant="field"
        />
      </div>
    );
  },
};

export const Multi: Story = {
  render: () => {
    const [values, setValues] = useState<string[]>(["reply"]);
    return (
      <div className="w-96 p-4">
        <Dropdown
          multi
          aria-label="Akce"
          onChange={setValues}
          options={[
            { value: "reply", label: "reply" },
            { value: "create_task", label: "create_task" },
            { value: "summarize", label: "summarize" },
            { value: "send_email", label: "send_email" },
            { value: "merge", label: "merge" },
          ]}
          placeholder="Vyber akce…"
          value={values}
          variant="field"
        />
      </div>
    );
  },
};

export const MultiSelectAll: Story = {
  render: () => {
    const [values, setValues] = useState<string[]>(["reply"]);
    return (
      <div className="w-96 p-4">
        <Dropdown
          multi
          showSelectAll
          aria-label="Akce"
          deselectAllLabel="Zrušit všechny položky"
          onChange={setValues}
          options={[
            { value: "reply", label: "reply" },
            { value: "create_task", label: "create_task" },
            { value: "summarize", label: "summarize" },
            { value: "send_email", label: "send_email" },
            { value: "merge", label: "merge" },
          ]}
          placeholder="Vyber akce…"
          selectAllLabel="Vybrat všechny položky"
          value={values}
          variant="field"
        />
      </div>
    );
  },
};

export const WithoutCodes: Story = {
  render: () => {
    const [value, setValue] = useState("a");
    return (
      <div className="flex justify-end p-4">
        <Dropdown
          onChange={setValue}
          options={[
            { value: "a", label: "Option Alpha" },
            { value: "b", label: "Option Beta" },
            { value: "c", label: "Option Gamma" },
          ]}
          value={value}
        />
      </div>
    );
  },
};

export const WithDescriptions: Story = {
  render: () => {
    const [value, setValue] = useState("opus");
    return (
      <div className="w-80 p-4">
        <Dropdown
          aria-label="Model"
          onChange={setValue}
          options={[
            { value: "opus", label: "opus", description: "Nejschopnější, nejpomalejší" },
            { value: "sonnet", label: "sonnet", description: "Vyvážený výkon a rychlost" },
            { value: "haiku", label: "haiku", description: "Nejrychlejší, nejlevnější" },
          ]}
          value={value}
          variant="field"
        />
      </div>
    );
  },
};
