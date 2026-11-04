import type { Meta, StoryObj } from "@storybook/react";
import { HighlightText } from "./HighlightText";

const meta: Meta<typeof HighlightText> = {
  title: "DesignSystem/HighlightText",
  component: HighlightText,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    text: "ask @Builder to run @Delivery on #zibby",
    highlights: [
      { start: 4, end: 12, tone: "accent" },
      { start: 20, end: 29, tone: "push" },
      { start: 33, end: 39, tone: "push" },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof HighlightText>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-foreground">
      <HighlightText highlights={[{ start: 4, end: 12, tone: "accent" }]} text="ask @Builder" />
      <HighlightText highlights={[{ start: 4, end: 13, tone: "push" }]} text="run @Delivery" />
      <HighlightText highlights={[{ start: 5, end: 13, tone: "dim" }]} text="read @notes.md" />
      <HighlightText highlights={[{ start: 5, end: 11 }]} text="open ~/a/b" />
    </div>
  ),
};

export const Playground: Story = {};
