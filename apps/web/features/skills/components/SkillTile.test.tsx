import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { Skill } from "../../../domain";
import { SkillTile } from "./SkillTile";

const skill: Skill = {
  id: "deploy",
  name: "Deploy",
  glyph: "spark",
  desc: "Ship the app",
  file: "~/zibby/skills/deploy/SKILL.md",
};

describe("SkillTile", () => {
  it("is a button that opens the editor when selectable", () => {
    const onSelect = vi.fn();
    render(<SkillTile onSelect={onSelect} selectLabel="Edit skill Deploy" skill={skill} />);
    const btn = screen.getByRole("button", { name: "Edit skill Deploy" });
    btn.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders statically (no button) without onSelect", () => {
    render(<SkillTile skill={skill} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Deploy")).toBeInTheDocument();
  });
});
