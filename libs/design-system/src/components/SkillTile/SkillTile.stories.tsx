import type { Meta, StoryObj } from "@storybook/react"
import type { Skill } from "../../domain"
import { SkillTile } from "./SkillTile"

const skill: Skill = {
  id: "rohlik",
  name: "rohlik",
  glyph: "cart",
  desc: "Naplní košík podle seznamu",
  ctx: "home",
  file: "~/zibby/skills/rohlik/SKILL.md",
}

const meta: Meta<typeof SkillTile> = {
  title: "Velín/SkillTile",
  component: SkillTile,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [(Story) => <div className="w-72"><Story /></div>],
  args: { skill, onRun: () => {} },
}
export default meta

type Story = StoryObj<typeof SkillTile>

export const Default: Story = {}
