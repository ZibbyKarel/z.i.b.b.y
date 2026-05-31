import type { Meta, StoryObj } from "@storybook/react";
import type { Integration } from "../../domain";
import { IntegrationCard } from "./IntegrationCard";

const integration: Integration = {
  id: "holly",
  name: "Holly (NAS)",
  glyph: "server",
  desc: "NAS démon pro média a zálohy",
  ctx: "home",
  status: "connected",
  file: "~/zibby/integrations/holly.json",
};

const meta: Meta<typeof IntegrationCard> = {
  title: "Dashboard/IntegrationCard",
  component: IntegrationCard,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  args: { integration },
};
export default meta;

type Story = StoryObj<typeof IntegrationCard>;

export const Connected: Story = {};
export const Disconnected: Story = {
  args: { integration: { ...integration, status: "disconnected" } },
};
export const Error: Story = {
  args: { integration: { ...integration, status: "error" } },
};
