import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../Button/Button";
import { Container } from "../Container/Container";
import { Icon } from "../Icon/Icon";
import { Tag } from "../Tag/Tag";
import { EntityCard } from "./EntityCard";

const meta: Meta<typeof EntityCard> = {
  title: "Components/EntityCard",
  component: EntityCard,
  decorators: [
    (Story) => (
      <Container width="360px">
        <Story />
      </Container>
    ),
  ],
  argTypes: {
    glyph: { control: "text" },
    avatarSize: { control: "select", options: ["sm", "md", "lg", "xl"] },
  },
  args: {
    title: "reviewer",
    glyph: "bot",
    description: "Prochází diff a hlásí regresní rizika před mergem.",
  },
};
export default meta;

type Story = StoryObj<typeof EntityCard>;

const badgeRows = [
  [
    <Tag key="model" tone="neutral">
      sonnet
    </Tag>,
    <Tag key="think" tone="neutral">
      ◇ medium
    </Tag>,
    <Tag key="usage" tone="accent">
      <Icon name="flow" size="xs" /> 3 pipelines
    </Tag>,
  ],
  [
    <Tag key="read" tone="neutral">
      read
    </Tag>,
    <Tag key="grep" tone="neutral">
      grep
    </Tag>,
  ],
];

const runAction = (
  <Container textAlign="right">
    <Button icon="play" intent="primary" size="sm">
      spustit
    </Button>
  </Container>
);

export const Overview: Story = {
  render: () => (
    <Container width="360px">
      <div className="flex flex-col gap-4">
        <EntityCard
          actions={runAction}
          badges={badgeRows}
          description="Prochází diff a hlásí regresní rizika před mergem."
          glyph="bot"
          openLabel="otevřít reviewer"
          subtitle="~/Projects/zibby"
          title="reviewer"
        />
        <EntityCard glyph="branch" title="minimal-entry" />
        <EntityCard
          logoSrc="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
          subtitle="team-slack"
          title="with-logo"
        />
      </div>
    </Container>
  ),
};

export const Playground: Story = {
  args: {
    badges: badgeRows,
    actions: runAction,
    openLabel: "otevřít reviewer",
    subtitle: "~/Projects/zibby",
  },
};
