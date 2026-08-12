import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "../Icon/Icon";
import { Tag } from "../Tag/Tag";
import { Typography } from "../Typography/Typography";
import { Pressable } from "./Pressable";

const meta: Meta<typeof Pressable> = {
  title: "DesignSystem/Pressable",
  component: Pressable,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Pressable>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Pressable aria-label="Změnit model" onClick={() => {}}>
        <Tag tone="accent">opus</Tag>
      </Pressable>
      <Pressable onClick={() => {}}>
        <Typography type="text">Detailní zobrazení</Typography>
      </Pressable>
      <Pressable aria-label="Rozbalit" onClick={() => {}}>
        <Icon name="chevron" size="sm" />
      </Pressable>
    </div>
  ),
};

export const Playground: Story = {
  argTypes: {
    disabled: { control: "boolean" },
    "aria-label": { control: "text" },
  },
  args: {
    "aria-label": "Změnit model",
    children: <Tag tone="accent">opus</Tag>,
    onClick: () => {},
  },
};
