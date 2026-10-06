import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { TextLink } from "./TextLink";

const meta: Meta<typeof TextLink> = {
  title: "DesignSystem/TextLink",
  component: TextLink,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof TextLink>;

export const Overview: Story = {
  render: () => (
    <div className="w-[200px] text-foreground-dim text-[13px]">
      Tab to it — a focus ring appears, no underline either way.
      <div className="mt-5">
        <TextLink truncate href="/org">
          <Typography truncate type="note">
            A reasonably long pinned page name that needs to ellipsize
          </Typography>
        </TextLink>
      </div>
    </div>
  ),
};

export const Playground: Story = {
  args: { href: "/org", children: "Org" },
};
