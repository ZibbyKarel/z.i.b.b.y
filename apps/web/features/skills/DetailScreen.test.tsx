import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@zibby/contracts";
import { DetailScreen, SkillDetailScreenTestId } from "./DetailScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const SKILL: Skill = {
  id: "deploy",
  name: "Deploy",
  glyph: "spark",
  desc: "Deploys the app",
  category: "Ops",
  instructions: "Run the deploy pipeline.",
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    skill: {
      data: undefined as unknown,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    update: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("./queries", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSkillQuery: () => hooks.skill,
  useSkillCategoriesQuery: () => ({ data: [{ name: "Ops", glyph: "spark" }] }),
}));
vi.mock("./mutations", () => ({
  useUpdateSkillMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteSkillMutation: () => ({ mutate: hooks.del, isPending: false }),
}));

describe("skills DetailScreen (N4d grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.skill = { data: SKILL, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("shows the backing file and the top-right actions by accessible name", () => {
    render(<DetailScreen skillId="deploy" />);
    expect(screen.getByText("~/zibby/skills/deploy/SKILL.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uložit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smazat" })).toBeInTheDocument();
  });

  it("Save submits the form to the update mutation", async () => {
    render(<DetailScreen skillId="deploy" />);
    await userEvent.click(screen.getByTestId(SkillDetailScreenTestId.Save));
    await vi.waitFor(() => {
      expect(hooks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: "deploy" },
          body: expect.objectContaining({ instructions: "Run the deploy pipeline." }),
        }),
      );
    });
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /skills", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<DetailScreen skillId="deploy" />);
    await userEvent.click(screen.getByTestId(SkillDetailScreenTestId.Delete));
    expect(screen.getByText("Smazat skill?")).toBeInTheDocument();
    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId(SkillDetailScreenTestId.Delete));
    await userEvent.click(confirm!);
    expect(hooks.del).toHaveBeenCalledWith(
      { params: { id: "deploy" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/skills");
  });
});
