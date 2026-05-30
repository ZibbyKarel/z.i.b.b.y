import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
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

describe("SkillTile", () => {
  it("renders the skill name, description and shortened path", () => {
    render(<SkillTile skill={skill} onRun={() => {}} />)
    expect(screen.getByText("rohlik")).toBeInTheDocument()
    expect(screen.getByText("Naplní košík podle seznamu")).toBeInTheDocument()
    expect(screen.getByText("rohlik/SKILL.md")).toBeInTheDocument()
  })

  it("runs the skill", async () => {
    const onRun = vi.fn()
    render(<SkillTile skill={skill} onRun={onRun} />)
    await userEvent.click(screen.getByRole("button", { name: /Spustit/ }))
    expect(onRun).toHaveBeenCalledWith(skill)
  })
})
