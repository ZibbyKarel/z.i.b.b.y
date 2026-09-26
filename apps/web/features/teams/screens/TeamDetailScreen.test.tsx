import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ConfirmDeleteButtonTestId } from "@zibby/design-system";
import type { Team } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import { TeamDetailScreen } from "./TeamDetailScreen";

const teamWithKb: Team = {
  id: "platform",
  name: "Platform",
  desc: "Core infra",
  knowledgeBase: { kind: "vault", path: "/Users/karel/vault", readOnly: true },
};

let team: Team = teamWithKb;

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const updateProjectMutate = vi.fn();
const replace = vi.fn();
const push = vi.fn();

vi.mock("../queries", () => ({
  useTeamQuery: () => ({ data: team, isPending: false, isError: false }),
}));

vi.mock("../mutations", () => ({
  useCreateTeamMutation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateTeamMutation: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteTeamMutation: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: [] }),
}));

let projects: { id: string; name: string; path: string; teamId?: string }[] = [];
vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: projects }),
}));

vi.mock("../../projects/mutations", () => ({
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
  team = teamWithKb;
});

describe("TeamDetailScreen (ZB-06)", () => {
  it("renders the team name from the query", () => {
    render(<TeamDetailScreen teamId="platform" />);
    expect(screen.getAllByText("Platform").length).toBeGreaterThan(0);
  });

  it("saves the core record via the update mutation", async () => {
    render(<TeamDetailScreen teamId="platform" />);
    await userEvent.click(screen.getByTestId("save-basics"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "platform" },
        body: expect.objectContaining({ name: "Platform", desc: "Core infra" }),
      }),
    );
  });

  it("saves the KB with readOnly always true", async () => {
    render(<TeamDetailScreen teamId="platform" />);
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

  it("lists projects whose teamId matches this team, navigating on row click", async () => {
    projects = [
      { id: "linked", name: "Linked Team Project", path: "~/p/linked", teamId: "platform" },
      { id: "other", name: "Other Project", path: "~/p/other", teamId: "growth" },
    ];
    render(<TeamDetailScreen teamId="platform" />);
    expect(screen.getByText("Linked Team Project")).toBeInTheDocument();
    expect(screen.queryByText("Other Project")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Linked Team Project"));
    expect(push).toHaveBeenCalledWith("/work/projects/linked");
  });

  it("deletes via the two-click ConfirmDeleteButton and redirects to the list", async () => {
    render(<TeamDetailScreen teamId="platform" />);
    const del = screen.getByTestId(ConfirmDeleteButtonTestId.Root);
    await userEvent.click(del);
    await userEvent.click(del);
    expect(deleteMutate).toHaveBeenCalledWith(
      { params: { id: "platform" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  describe("new team mode", () => {
    it("shows only the basics panel — no knowledge base until saved", () => {
      render(<TeamDetailScreen />);
      expect(screen.getByTestId("save-basics")).toBeInTheDocument();
      expect(screen.queryByTestId("save-kb")).not.toBeInTheDocument();
    });

    it("creates the team and redirects to its detail page", async () => {
      render(<TeamDetailScreen />);
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
  });
});
