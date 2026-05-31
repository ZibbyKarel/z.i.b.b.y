import type { Meta, StoryObj } from "@storybook/react";
import type { Skill } from "../../domain";
import { RunModal } from "./RunModal";

const skill: Skill = {
  id: "rohlik",
  name: "rohlik",
  glyph: "cart",
  desc: "Naplní košík podle seznamu",
  ctx: "home",
  file: "~/zibby/skills/rohlik/SKILL.md",
};

const meta: Meta<typeof RunModal> = {
  title: "Dashboard/RunModal",
  component: RunModal,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-screen">
        <Story />
      </div>
    ),
  ],
  args: {
    skill,
    projects: ["media-vault", "home-ops", "zibby-core", "rohlik-list"],
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof RunModal>;

export const Default: Story = {};
