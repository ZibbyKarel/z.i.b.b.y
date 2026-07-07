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

/** Per-type `@mention` tones alongside untoned path highlights (Phase 31 — CommandLine). */
export const TonedMentions: Story = {
  render: () => {
    const [text, setText] = useState(
      "@Builder projdi ~/zibby/backlog a spusť @Delivery, přilož @report.md",
    );
    const highlights = [
      { start: 0, end: 8, tone: "accent" as const }, // @Builder — agent
      { start: 16, end: 31 }, // ~/zibby/backlog — untoned path
      { start: 40, end: 49, tone: "push" as const }, // @Delivery — pipeline
      { start: 58, end: 68, tone: "dim" as const }, // @report.md — unresolved file
    ];
    return (
      <HighlightTextAreaField
        highlights={highlights}
        hint="agent = accent · pipeline = push · soubor/neznámé = dim"
        label="Zadání"
        onChange={(e) => setText(e.target.value)}
        value={text}
      />
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
