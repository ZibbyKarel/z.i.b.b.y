import type { Meta, StoryObj } from "@storybook/react";
import { Card, Container, Typography } from "@zibby/design-system";
import { Collection } from "./Collection";

const meta: Meta<typeof Collection> = {
  title: "Dashboard/Collection",
  component: Collection,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Container padding="300">
        <Story />
      </Container>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Collection<string>>;

const empty = {
  glyph: "spark" as const,
  title: "Zatím žádné skilly",
  description: "Vytvoř svůj první SKILL.md a objeví se tady.",
  actionLabel: "Přidat skill",
  hint: "~/zibby/skills/",
};

export const Filled: Story = {
  args: {
    items: ["rohlik", "wolt", "bolt", "uber"],
    empty,
    renderItem: (name) => (
      <Card background="panel" key={name} radius="sm">
        <Container padding="200">
          <Typography mono type="note" variant="secondary">
            {name}
          </Typography>
        </Container>
      </Card>
    ),
  },
};

export const Empty: Story = {
  args: {
    items: [],
    empty,
    renderItem: (name) => <div key={name}>{name}</div>,
  },
};
