import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "../../domain";
import { Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const SKILLS: Skill[] = [
  {
    id: "deploy",
    name: "Deploy",
    glyph: "spark",
    desc: "Deploys the app",
    category: "Ops",
    file: "~/zibby/skills/deploy/SKILL.md",
  },
];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    skills: { data: [] as unknown[], isPending: false, isError: false, refetch: vi.fn() },
    create: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useSkillsQuery: () => hooks.skills,
  useSkillCategoriesQuery: () => ({ data: [{ name: "Ops", glyph: "spark" }] }),
}));
vi.mock("./mutations", () => ({
  useCreateSkillMutation: () => ({ mutate: hooks.create, isPending: false }),
  useCreateSkillCategoryMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkillCategoryMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("skills Screen (N4d grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.create.mockClear();
    hooks.skills = { data: SKILLS, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("a tile click NAVIGATES to the skill detail route — no dialog", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít skill Deploy" }));
    expect(push).toHaveBeenCalledWith("/skills/deploy");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the header add action opens the CREATE-ONLY dialog (no edit/delete vocabulary)", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat skill" }));
    expect(screen.getByLabelText("Nový skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vytvořit skill" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Uložit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Smazat" })).toBeNull();
  });
});
