import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { HighlightTextAreaField } from "./HighlightTextAreaField";

/** Highlight every `~/…`, `./…` or absolute `/…` path occurrence in the value. */
const PATH_RE = /(~\/[\w.\-/]+|\.\/[\w.\-/]+|\/[\w.\-/]{5,})/g;
function pathHighlights(value: string) {
  return [...value.matchAll(PATH_RE)].flatMap((m) =>
    m.index === undefined ? [] : [{ start: m.index, end: m.index + m[0].length }],
  );
}

const meta: Meta<typeof HighlightTextAreaField> = {
  title: "DesignSystem/Field/HighlightTextAreaField",
  component: HighlightTextAreaField,
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

type Story = StoryObj<typeof HighlightTextAreaField>;

export const Overview: Story = {
  render: () => {
    const [text, setText] = useState(
      "Zkontroluj zálohy na Holly a výsledek ulož do ~/zibby/memory/holly-backup.md",
    );
    return (
      <div className="flex flex-col gap-6">
        <HighlightTextAreaField
          highlights={pathHighlights(text)}
          hint="cesty se zvýrazní a přidají do kontextu"
          label="Zadání"
          onChange={(e) => setText(e.target.value)}
          value={text}
        />
        <HighlightTextAreaField
          error="Zadání nesmí být prázdné"
          highlights={[]}
          label="S chybou"
          value=""
        />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [text, setText] = useState("Otevři ./apps/web a /var/log/app");
    return (
      <HighlightTextAreaField
        {...args}
        highlights={pathHighlights(text)}
        onChange={(e) => setText(e.target.value)}
        value={text}
      />
    );
  },
  args: { label: "Zadání", hint: "zvýrazní cesty inline" },
};
