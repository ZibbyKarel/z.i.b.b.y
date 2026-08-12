import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Dropdown } from "./Dropdown";

const LANG_OPTIONS = [
  { value: "cs", label: "Čeština", code: "CZ" },
  { value: "en", label: "English", code: "EN" },
];

const MODEL_OPTIONS = [
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

const MODEL_OPTIONS_WITH_DESCRIPTIONS = [
  { value: "opus", label: "opus", description: "Nejschopnější, nejpomalejší" },
  { value: "sonnet", label: "sonnet", description: "Vyvážený výkon a rychlost" },
  { value: "haiku", label: "haiku", description: "Nejrychlejší, nejlevnější" },
];

const ACTION_OPTIONS = [
  { value: "reply", label: "reply" },
  { value: "create_task", label: "create_task" },
  { value: "summarize", label: "summarize" },
  { value: "send_email", label: "send_email" },
  { value: "merge", label: "merge" },
];

const meta: Meta<typeof Dropdown> = {
  title: "DesignSystem/Dropdown",
  component: Dropdown,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    options: MODEL_OPTIONS,
    value: "opus",
    variant: "field",
  },
  argTypes: {
    variant: { control: "radio", options: ["inline", "field"] },
    size: { control: "radio", options: ["sm", "md"] },
    tone: { control: "select", options: ["neutral", "accent", "ok", "warn", "bad", "run"] },
    invalid: { control: "boolean" },
    compact: { control: "boolean" },
  },
};
export default meta;

type Story = StoryObj<typeof Dropdown>;

export const Overview: Story = {
  render: () => {
    const [lang, setLang] = useState("cs");
    const [langSmall, setLangSmall] = useState("cs");
    const [model, setModel] = useState("opus");
    const [modelDesc, setModelDesc] = useState("opus");
    const [noCode, setNoCode] = useState("a");
    const [actions, setActions] = useState<string[]>(["reply"]);
    const [actionsAll, setActionsAll] = useState<string[]>(["reply"]);

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-sm text-foreground-dim">inline — language switch</span>
          <div className="flex justify-end p-4">
            <Dropdown
              aria-label="Jazyk rozhraní"
              onChange={setLang}
              options={LANG_OPTIONS}
              value={lang}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-sm text-foreground-dim">inline, size=&quot;sm&quot;</span>
          <div className="flex justify-end p-4">
            <Dropdown
              aria-label="Jazyk rozhraní"
              onChange={setLangSmall}
              options={LANG_OPTIONS}
              size="sm"
              value={langSmall}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-sm text-foreground-dim">inline, no option codes</span>
          <div className="flex justify-end p-4">
            <Dropdown
              onChange={setNoCode}
              options={[
                { value: "a", label: "Option Alpha" },
                { value: "b", label: "Option Beta" },
                { value: "c", label: "Option Gamma" },
              ]}
              value={noCode}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-sm text-foreground-dim">variant=&quot;field&quot;</span>
          <div className="w-80 p-4">
            <Dropdown
              aria-label="Model"
              onChange={setModel}
              options={MODEL_OPTIONS}
              value={model}
              variant="field"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-sm text-foreground-dim">
            field, with option descriptions
          </span>
          <div className="w-80 p-4">
            <Dropdown
              aria-label="Model"
              onChange={setModelDesc}
              options={MODEL_OPTIONS_WITH_DESCRIPTIONS}
              value={modelDesc}
              variant="field"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-sm text-foreground-dim">multi-select</span>
          <div className="w-96 p-4">
            <Dropdown
              multi
              aria-label="Akce"
              onChange={setActions}
              options={ACTION_OPTIONS}
              placeholder="Vyber akce…"
              value={actions}
              variant="field"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-sm text-foreground-dim">
            multi-select with select-all
          </span>
          <div className="w-96 p-4">
            <Dropdown
              multi
              showSelectAll
              aria-label="Akce"
              deselectAllLabel="Zrušit všechny položky"
              onChange={setActionsAll}
              options={ACTION_OPTIONS}
              placeholder="Vyber akce…"
              selectAllLabel="Vybrat všechny položky"
              value={actionsAll}
              variant="field"
            />
          </div>
        </div>
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState(String(args.value ?? "opus"));
    return <Dropdown {...args} multi={false} onChange={setValue} value={value} />;
  },
};
