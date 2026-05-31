import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "Dashboard/EmptyState",
  component: EmptyState,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
  args: {
    glyph: "spark",
    title: "Zatím žádné skilly",
    description:
      "Skilly jsou soubory SKILL.md na disku. Přidej první a objeví se tu jako karta s čudlíkem Spustit.",
    actionLabel: "Přidat skill",
    hint: "// vytvoří ~/zibby/skills/<název>/SKILL.md",
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {};
