import type { Meta, StoryObj } from "@storybook/react";
import { BoardTag } from "../BoardTag/BoardTag";
import { BoardText } from "../BoardText/BoardText";
import { IconTile } from "../IconTile/IconTile";
import { BoardColumnHeader, BoardGrid, BoardLine, BoardRow } from "./BoardRow";

const meta: Meta<typeof BoardRow> = {
  title: "DesignSystem/BoardRow",
  component: BoardRow,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    tone: {
      control: "select",
      options: ["working", "thinking", "blocked", "error", "done", "idle", "neutral"],
    },
    padding: { control: "radio", options: ["row", "pr"] },
  },
  args: { tone: "blocked", selected: false, needsYou: false },
  decorators: [(Story) => <div className="w-[420px] bg-panel">{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof BoardRow>;

const issue = (tag?: boolean) => (
  <>
    <BoardGrid columns="issue">
      <IconTile filled={false} glyph="checkpoint" size="xs" tone="neutral" />
      <BoardLine gap="6">
        <BoardText kind="id">ZB-142</BoardText>
        <BoardText kind="title">Checkout fails on empty cart</BoardText>
      </BoardLine>
      {tag ? <BoardTag variant="you">YOU · 2H</BoardTag> : <span />}
    </BoardGrid>
    <BoardLine gap="6" indent="icon">
      <BoardText kind="meta" tone="ink">
        WAITING FOR YOU
      </BoardText>
    </BoardLine>
  </>
);

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col">
      <BoardRow tone="blocked">{issue()}</BoardRow>
      <BoardRow needsYou tone="blocked">
        {issue(true)}
      </BoardRow>
      <BoardRow selected tone="working">
        {issue()}
      </BoardRow>
      <BoardRow columns="run" tone="working">
        <BoardText kind="body">Refactor billing</BoardText>
        <BoardText kind="meta">WORKING</BoardText>
        <BoardText kind="link">ZB-9 ↗</BoardText>
      </BoardRow>
      <BoardColumnHeader columns="run">
        <BoardText kind="colHead">TASK · STEP</BoardText>
        <BoardText kind="colHead">PROGRESS</BoardText>
        <BoardText kind="colHead">ISSUE</BoardText>
      </BoardColumnHeader>
    </div>
  ),
};

export const Playground: Story = { render: (args) => <BoardRow {...args}>{issue()}</BoardRow> };
