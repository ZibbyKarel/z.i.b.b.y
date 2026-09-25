import type { Meta, StoryObj } from "@storybook/react";
import { Wordmark } from "./Wordmark";

const meta: Meta<typeof Wordmark> = {
  title: "DesignSystem/Wordmark",
  component: Wordmark,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Wordmark>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Wordmark />
      <Wordmark>ACME CORP</Wordmark>
    </div>
  ),
};

export const Playground: Story = {
  args: { children: "ZIBBYCORP" },
};
