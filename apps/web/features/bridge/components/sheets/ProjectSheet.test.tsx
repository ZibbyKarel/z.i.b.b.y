import type { ProjectCi } from "@zibby/contracts";
import { AnchoredSheetTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAboutButtonTestId } from "../../../chat/components/ChatAboutButton";
import { ChatProvider } from "../../../chat/ChatContext";
import { renderWithProviders, screen } from "../../../../test/render";
import { ProjectSheet, ProjectSheetTestId } from "./ProjectSheet";

const h = vi.hoisted(() => ({ ci: undefined as unknown, mutate: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../../projects/queries", () => ({
  useProjectsQuery: () => ({ data: [{ id: "acme", name: "Acme" }] }),
  useProjectCiQuery: () => ({ data: h.ci }),
}));
vi.mock("../../../projects/mutations", () => ({
  useFixProjectCiMutation: () => ({ mutate: h.mutate, isPending: false }),
}));

const anchor = {
  side: "r",
  left: 400,
  width: 800,
  top: 0,
  height: 700,
  eL: -2,
  eT: 0,
  eH: 40,
} as const;

const ci = (state: ProjectCi["state"]): ProjectCi => ({
  projectId: "acme",
  provider: "github",
  repoUrl: "https://github.com/acme/app",
  branch: "main",
  headSha: "abcdef1234",
  state,
  checkedAt: "2026-11-12T10:00:00.000Z",
  workflows: [
    {
      id: 11,
      name: "CI",
      state,
      jobs: [
        {
          id: 101,
          name: "test",
          url: "https://github.com/acme/app/actions/runs/11/job/101",
          state,
          steps: [
            { number: 1, name: "Checkout", state: "passing" },
            { number: 2, name: "Run tests", state: state === "failing" ? "failing" : "passing" },
          ],
        },
      ],
    },
  ],
});

const render = () =>
  renderWithProviders(
    <ChatProvider>
      <ProjectSheet anchor={anchor} id="acme" onClose={() => {}} />
    </ChatProvider>,
  );

beforeEach(() => {
  h.mutate.mockReset();
});

describe("ProjectSheet", () => {
  it("title links to the repo root and lists workflow → job → steps with the failed one", () => {
    h.ci = ci("failing");
    render();
    expect(screen.getByTestId(AnchoredSheetTestId.TitleLink)).toHaveAttribute(
      "href",
      "https://github.com/acme/app",
    );
    expect(screen.getAllByTestId(ProjectSheetTestId.Workflow)).toHaveLength(1);
    expect(screen.getByTestId(ProjectSheetTestId.Job)).toHaveTextContent("test");
    const steps = screen.getAllByTestId(ProjectSheetTestId.Step);
    expect(steps.map((s) => s.getAttribute("data-state"))).toEqual(["passing", "failing"]);
    expect(steps[1]).toHaveTextContent("2. Run tests");
  });

  it("red CI: discuss in chat + Opravit CI, which calls the fix endpoint", async () => {
    h.ci = ci("failing");
    render();
    expect(screen.getByTestId(ChatAboutButtonTestId.Root)).toBeInTheDocument();
    const fix = screen.getByTestId(ProjectSheetTestId.FixCi);
    expect(fix).toHaveTextContent("Opravit CI");
    await userEvent.click(fix);
    expect(h.mutate).toHaveBeenCalledWith(
      { params: { projectId: "acme" }, body: {} },
      expect.any(Object),
    );
  });

  it("an open fix task for the commit disables the button as Oprava běží", () => {
    h.ci = { ...ci("failing"), fixTaskId: "task_9" };
    render();
    const fix = screen.getByTestId(ProjectSheetTestId.FixCi);
    expect(fix).toBeDisabled();
    expect(fix).toHaveTextContent("Oprava běží");
  });

  it("green CI: discuss in chat but no Opravit CI", () => {
    h.ci = ci("passing");
    render();
    expect(screen.getByTestId(ChatAboutButtonTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(ProjectSheetTestId.FixCi)).not.toBeInTheDocument();
  });
});
