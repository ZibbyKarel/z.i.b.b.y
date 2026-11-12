import type { Meta, StoryObj } from "@storybook/react";
import { BoardTag } from "../BoardTag/BoardTag";
import { Button } from "../Button/Button";
import { BoardText } from "../BoardText/BoardText";
import { IconBadge } from "../IconBadge/IconBadge";
import { IconTile } from "../IconTile/IconTile";
import { BoardColumnHeader, BoardGrid, BoardLead, BoardLine, BoardRow } from "./BoardRow";

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
  args: { tone: "blocked", bar: true, selected: false, needsYou: false },
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
      <BoardRow
        action={
          <Button icon="play" intent="ghost" size="sm">
            Implement
          </Button>
        }
        onClick={() => {}}
        tone="idle"
      >
        <BoardText kind="title">
          A long manual task title that truncates before the action
        </BoardText>
        <BoardLine
          end={
            <BoardText kind="meta" tone="ink3">
              1H
            </BoardText>
          }
          gap="6"
        >
          <BoardText kind="meta" tone="ink">
            TO DO
          </BoardText>
          <BoardText kind="meta" tone="ink3">
            · SHOP
          </BoardText>
        </BoardLine>
      </BoardRow>
      <BoardRow
        onClick={() => {}}
        tone="idle"
        trailing={<IconBadge count={3} icon="chat" label="3 unresolved" />}
      >
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

/** `bar={false}`: the row without its left status bar (PR cards). */
export const NoBar: Story = {
  render: (args) => (
    <BoardRow {...args} bar={false}>
      {issue()}
    </BoardRow>
  ),
};

/** `alert` + `bar={false}`: an error row emphasised by its background only (red CI). */
export const Alert: Story = {
  render: (args) => (
    <BoardRow {...args} alert bar={false} tone="error">
      {issue()}
    </BoardRow>
  ),
};

export const TwoLineLead: Story = {
  render: (args) => (
    <BoardRow {...args}>
      <BoardLead lead={<IconTile filled={false} glyph="checkpoint" size="md" tone="neutral" />}>
        <BoardLine gap="6">
          <BoardText kind="id">ZB-142</BoardText>
          <BoardText kind="title">Checkout fails on empty cart</BoardText>
        </BoardLine>
        <BoardLine gap="6">
          <BoardText kind="meta">orders</BoardText>
        </BoardLine>
      </BoardLead>
    </BoardRow>
  ),
};
