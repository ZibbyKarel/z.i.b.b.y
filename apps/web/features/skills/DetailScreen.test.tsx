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
    sync: vi.fn(),
  },
}));

vi.mock("./queries", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSkillQuery: () => hooks.skill,
  useSkillCategoriesQuery: () => ({ data: [{ name: "Ops", glyph: "spark" }] }),
  useExternalSkillUsagesQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("./mutations", () => ({
  useUpdateSkillMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteSkillMutation: () => ({ mutate: hooks.del, isPending: false }),
  useSyncExternalSkillMutation: () => ({ mutate: hooks.sync, isPending: false }),
  useUninstallExternalSkillMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

describe("skills DetailScreen (N4d grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.sync.mockClear();
    hooks.skill = { data: SKILL, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("shows the top-right actions by accessible name and no file-path subtitle", () => {
    render(<DetailScreen skillId="deploy" />);
    expect(screen.queryByText("~/zibby/skills/deploy/SKILL.md")).toBeNull();
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
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
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
    expect(push).toHaveBeenCalledWith("/system/registries/skills");
  });

  it("an external skill is read-only: no Save/Delete, sync + uninstall instead", async () => {
    hooks.skill = {
      data: {
        ...SKILL,
        source: {
          owner: "cloudflare",
          repo: "skills",
          url: "https://github.com/cloudflare/skills",
          path: "deploy",
          sha: "aaa",
          treeSha: "t",
          installedAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z",
          checkedAt: "2026-10-01T00:00:00Z",
        },
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<DetailScreen skillId="deploy" />);
    expect(screen.queryByTestId(SkillDetailScreenTestId.Save)).toBeNull();
    expect(screen.queryByTestId(SkillDetailScreenTestId.Delete)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("cloudflare")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId(SkillDetailScreenTestId.Sync));
    expect(hooks.sync).toHaveBeenCalledWith(
      { params: { id: "deploy" }, body: {} },
      expect.anything(),
    );

    await userEvent.click(screen.getByTestId(SkillDetailScreenTestId.Uninstall));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
