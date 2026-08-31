import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DropDownButtonTestId, ImmersiveShellTestId } from "@zibby/design-system";
import type { Team } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../test/render";
import { ImmersivePageTestId } from "../../components/layout/ImmersivePage/ImmersivePage";
import { DetailScreen } from "./DetailScreen";

const team: Team = {
  id: "platform",
  name: "Platform",
  desc: "Core infra",
  knowledgeBase: { kind: "vault", path: "/Users/karel/vault", readOnly: true },
};

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const updateProjectMutate = vi.fn();
const replace = vi.fn();
const push = vi.fn();

vi.mock("./queries", () => ({
  useTeamQuery: () => ({ data: team, isPending: false, isError: false }),
}));

vi.mock("./mutations", () => ({
  useCreateTeamMutation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateTeamMutation: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteTeamMutation: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock("../companies", () => ({
  useCompaniesQuery: () => ({ data: [] }),
}));

// The member-projects panel is the reverse `teamId` lookup over the shared
// project registry — reassigned per test, so this starts empty.
let projects: { id: string; name: string; path: string; teamId?: string }[] = [];
vi.mock("../projects", () => ({
  useProjectsQuery: () => ({ data: projects }),
}));

// The LinkProjectDialog (opened from the member-projects panel action) reads
// the same project registry and updates via this mutation.
vi.mock("../projects/mutations", () => ({
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

beforeEach(() => {
  createMutate.mockReset();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  updateProjectMutate.mockReset();
  replace.mockReset();
  push.mockReset();
  projects = [];
});

describe("teams DetailScreen", () => {
  it("renders the team name from the query", () => {
    render(<DetailScreen teamId="platform" />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
  });

  it("existing-team mode: title is the team name, back goes to /teams", () => {
    render(<DetailScreen teamId="platform" />);
    expect(screen.getByTestId(ImmersiveShellTestId.Title)).toHaveTextContent("Platform");
    expect(screen.getByTestId(ImmersivePageTestId.Back)).toHaveAttribute("href", "/teams");
  });

  it("edits the core record in place", () => {
    render(<DetailScreen teamId="platform" />);
    expect(screen.getByDisplayValue("Core infra")).toBeInTheDocument();
  });

  it("saves the core record via the update mutation", async () => {
    render(<DetailScreen teamId="platform" />);
    await userEvent.click(screen.getByTestId("save-basics"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "platform" },
        body: expect.objectContaining({ name: "Platform", desc: "Core infra" }),
      }),
    );
  });

  describe("knowledge base panel", () => {
    it("shows the current vault path", () => {
      render(<DetailScreen teamId="platform" />);
      expect(screen.getByDisplayValue("/Users/karel/vault")).toBeInTheDocument();
    });

    it("renders no writable readOnly toggle/switch/checkbox anywhere", () => {
      render(<DetailScreen teamId="platform" />);
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("saves the KB with readOnly always true", async () => {
      render(<DetailScreen teamId="platform" />);
      await userEvent.click(screen.getByTestId("save-kb"));
      expect(updateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: "platform" },
          body: {
            knowledgeBase: {
              kind: "vault",
              path: "/Users/karel/vault",
              gitRemote: undefined,
              readOnly: true,
            },
          },
        }),
      );
    });

    it("clears the KB via the clear action", async () => {
      render(<DetailScreen teamId="platform" />);
      await userEvent.click(screen.getByTestId("clear-kb"));
      expect(updateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: "platform" },
          body: { knowledgeBase: undefined },
        }),
      );
    });
  });

  describe("member projects", () => {
    it("shows the empty state when no project links to this team", () => {
      render(<DetailScreen teamId="platform" />);
      expect(screen.getByTestId("member-projects-empty")).toBeInTheDocument();
    });

    it("lists projects whose teamId matches this team, navigating on click", async () => {
      projects = [
        { id: "linked", name: "Linked Team Project", path: "~/p/linked", teamId: "platform" },
        { id: "other", name: "Other Project", path: "~/p/other", teamId: "growth" },
        { id: "solo", name: "Solo Project", path: "~/p/solo" },
      ];
      render(<DetailScreen teamId="platform" />);

      expect(screen.getByText("Linked Team Project")).toBeInTheDocument();
      expect(screen.queryByText("Other Project")).not.toBeInTheDocument();
      expect(screen.queryByText("Solo Project")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Linked Team Project"));
      expect(push).toHaveBeenCalledWith("/projects/linked");
    });
  });

  describe("add project actions", () => {
    it("shows the member panel's add control", () => {
      render(<DetailScreen teamId="platform" />);
      expect(screen.getByTestId(DropDownButtonTestId.Primary)).toBeInTheDocument();
    });

    it("opens the link-existing-project dialog from the primary action", async () => {
      render(<DetailScreen teamId="platform" />);
      await userEvent.click(screen.getByTestId(DropDownButtonTestId.Primary));
      expect(screen.getByText("propojit s tímto týmem")).toBeInTheDocument();
    });
  });

  it("deletes via the confirm dialog and redirects to the list", async () => {
    render(<DetailScreen teamId="platform" />);
    await userEvent.click(screen.getByTestId("delete-team"));
    expect(screen.getByText("Smazat tým?")).toBeInTheDocument();

    const confirmButton = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId("delete-team"));
    await userEvent.click(confirmButton!);

    expect(deleteMutate).toHaveBeenCalledWith(
      { params: { id: "platform" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  describe("new team mode", () => {
    it("shows only the basics panel — no knowledge base until saved", () => {
      render(<DetailScreen />);
      expect(screen.getByTestId("save-basics")).toBeInTheDocument();
      expect(screen.queryByTestId("save-kb")).not.toBeInTheDocument();
    });

    it("creates the team and redirects to its detail page", async () => {
      render(<DetailScreen />);
      const nameField = screen.getByPlaceholderText("Platforma");
      await userEvent.type(nameField, "Growth");
      await userEvent.click(screen.getByTestId("save-basics"));
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ id: "growth", name: "Growth" }),
        }),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it("new-team mode: back goes to /teams (never loops to /teams/new)", () => {
      render(<DetailScreen />);
      expect(screen.getByTestId(ImmersivePageTestId.Back)).toHaveAttribute("href", "/teams");
    });
  });
});
