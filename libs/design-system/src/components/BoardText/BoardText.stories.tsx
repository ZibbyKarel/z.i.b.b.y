import type { Meta, StoryObj } from "@storybook/react";
import { BoardText, type BoardTextKind } from "./BoardText";

const KINDS: BoardTextKind[] = [
  "id",
  "title",
  "body",
  "meta",
  "prNum",
  "prTitle",
  "prMeta",
  "lead",
  "kicker",
  "colHead",
  "link",
];

const meta: Meta<typeof BoardText> = {
  title: "DesignSystem/BoardText",
  component: BoardText,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    kind: { control: "select", options: KINDS },
    tone: { control: "select", options: [undefined, "ink", "ink2", "ink3"] },
  },
  args: { kind: "title", children: "Checkout fails on empty cart" },
};
export default meta;

type Story = StoryObj<typeof BoardText>;

export const Overview: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col gap-2">
      {KINDS.map((k) => (
        <BoardText key={k} kind={k}>
          {k} · Sample text
        </BoardText>
      ))}
    </div>
  ),
};
export const Playground: Story = {};
