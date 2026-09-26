import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Project, ProjectLocalState, ProjectProfile } from "@zibby/contracts";
import { TabsTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ProjectDetailScreen } from "./ProjectDetailScreen";

const project: Project = {
  id: "media-vault",
  name: "media-vault",
  path: "~/Projects/media-vault",
};

let projectOverride: Partial<Project> = {};

const profile: ProjectProfile = {
  identity: { people: [{ name: "Jana", role: "PM", vip: true }] },
  autonomy_policy: { can_do_alone: ["reply"], respond_as: "draft_only" },
  daily_rhythm: { standup_time: "09:30", active_hours: "09:00-18:00" },
};

const updateMutate = vi.fn();
const createProjectMutate = vi.fn();
const updateProjectMutate = vi.fn();
const deleteProjectMutate = vi.fn();
const setSecretsMutate = vi.fn();
const deleteSecretsMutate = vi.fn();
const cloneProjectMutate = vi.fn();
const replace = vi.fn();
const push = vi.fn();

let localState: ProjectLocalState | undefined = {
  present: true,
  isGitRepo: true,
  resolvedPath: project.path ?? null,
  source: "path",
  cloneRoot: "/Users/karel/zibby-clones",
};

vi.mock("../queries", () => ({
  useProjectQuery: () => ({
    data: { ...project, ...projectOverride },
    isPending: false,
    isError: false,
  }),
  useProjectProfileQuery: () => ({ data: profile }),
  useProjectStandupQuery: () => ({ data: null }),
  useProjectLocalStateQuery: () => ({ data: localState }),
  useProjectCategoriesQuery: () => ({ data: [{ name: "Dev", glyph: "code" }] }),
  useProjectIntegrationActivityQuery: () => ({ data: [] }),
  useCiStatusQuery: () => ({ data: [] }),
  useProjectTaskStats: () => ({ total: 0, groups: [] }),
  useResolvedProjectQuery: () => ({ data: { people: [], integrations: [] } }),
  useProjectPrsQuery: () => ({ data: [] }),
}));

let companies: { id: string; name: string }[] = [];
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: companies }) }));

let teams: { id: string; name: string }[] = [];
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: teams }) }));

let cloneIsPending = false;

vi.mock("../mutations", () => ({
  useUpdateProjectProfileMutation: () => ({ mutate: updateMutate, isPending: false }),
  useCreateProjectMutation: () => ({ mutate: createProjectMutate, isPending: false }),
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
  useDeleteProjectMutation: () => ({ mutate: deleteProjectMutate, isPending: false }),
  useSetProjectSecretsMutation: () => ({ mutate: setSecretsMutate, isPending: false }),
  useDeleteProjectSecretsMutation: () => ({ mutate: deleteSecretsMutate, isPending: false }),
  useCloneProjectMutation: () => ({ mutate: cloneProjectMutate, isPending: cloneIsPending }),
  useMergeProjectPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../integrations/queries", () => ({
  useIntegrationsQuery: () => ({
    data: [
      {
        id: "team-slack",
        kind: "slack",
        projectId: "media-vault",
        name: "Team Slack",
        enabled: true,
        config: { kind: "slack", channels: [] },
        status: "connected",
        hasCredentials: true,
      },
    ],
  }),
  useChannelItemsQuery: () => ({ data: [] }),
}));

vi.mock("../../integrations/mutations", () => ({
  useCreateIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCredentialsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useTestIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

let searchCompanyId = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (searchCompanyId) params.set("companyId", searchCompanyId);
    return params;
  },
}));

beforeEach(() => {
  updateMutate.mockReset();
  createProjectMutate.mockReset();
  updateProjectMutate.mockReset();
  deleteProjectMutate.mockReset();
  setSecretsMutate.mockReset();
  deleteSecretsMutate.mockReset();
  cloneProjectMutate.mockReset();
  replace.mockReset();
  push.mockReset();
  searchCompanyId = "";
  companies = [];
  teams = [];
  projectOverride = {};
  cloneIsPending = false;
  localState = {
    present: true,
    isGitRepo: true,
    resolvedPath: project.path ?? null,
    source: "path",
    cloneRoot: "/Users/karel/zibby-clones",
  };
});

describe("ProjectDetailScreen (ZB-06)", () => {
  it("renders the project name from the query", () => {
    render(<ProjectDetailScreen projectId="media-vault" />);
    expect(screen.getAllByText("media-vault").length).toBeGreaterThan(0);
  });

  it("clicking a tab navigates to the [tab] route instead of an internal switch", async () => {
    render(<ProjectDetailScreen projectId="media-vault" tab="overview" />);
    await userEvent.click(screen.getByTestId(`${TabsTestId.Tab}-profile`));
    expect(push).toHaveBeenCalledWith("/work/projects/media-vault/profile");
  });

  it("shows the person's name and standup time on the profile tab", () => {
    render(<ProjectDetailScreen projectId="media-vault" tab="profile" />);
    expect(screen.getByDisplayValue("Jana")).toBeInTheDocument();
    expect(screen.getByDisplayValue("09:30")).toBeInTheDocument();
  });

  it("saves the core record via the update mutation (no path in the body)", async () => {
    render(<ProjectDetailScreen projectId="media-vault" tab="overview" />);
    await userEvent.click(screen.getByTestId("save-basics"));
    expect(updateProjectMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "media-vault" },
        body: expect.objectContaining({ name: "media-vault" }),
      }),
    );
    const call = updateProjectMutate.mock.calls[0]?.[0] as { body: Record<string, unknown> };
    expect(call.body).not.toHaveProperty("path");
  });

  it("saves team on button click", async () => {
    render(<ProjectDetailScreen projectId="media-vault" tab="profile" />);
    await userEvent.click(screen.getByTestId("save-team"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "media-vault" },
        body: expect.objectContaining({ identity: expect.any(Object) }),
      }),
      expect.any(Object),
    );
  });

  it("lists the project's integrations with an add control", () => {
    render(<ProjectDetailScreen projectId="media-vault" tab="integrations" />);
    expect(screen.getByText("Team Slack")).toBeInTheDocument();
    expect(screen.getByTestId("add-integration")).toBeInTheDocument();
  });

  describe("new project mode", () => {
    it("shows only the basics panel — no team/integrations until saved", () => {
      render(<ProjectDetailScreen />);
      expect(screen.getByTestId("save-basics")).toBeInTheDocument();
      expect(screen.queryByTestId("save-team")).not.toBeInTheDocument();
    });

    it("creates the project and redirects to its detail page", async () => {
      render(<ProjectDetailScreen />);
      const nameField = screen.getByPlaceholderText("media-vault");
      await userEvent.type(nameField, "Alpha");
      await userEvent.click(screen.getByTestId("save-basics"));
      expect(createProjectMutate).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ id: "alpha", name: "Alpha" }) }),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    describe("pre-linked to a company via ?companyId=", () => {
      beforeEach(() => {
        searchCompanyId = "acme";
        companies = [{ id: "acme", name: "Acme" }];
      });

      it("includes the companyId in the create body on save", async () => {
        render(<ProjectDetailScreen />);
        await userEvent.type(screen.getByPlaceholderText("media-vault"), "Alpha");
        await userEvent.click(screen.getByTestId("save-basics"));
        expect(createProjectMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({ id: "alpha", name: "Alpha", companyId: "acme" }),
          }),
          expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
      });
    });
  });

  describe("local-clone state", () => {
    it("shows the missing-clone banner with the clone button disabled without a gitRemote", () => {
      localState = {
        present: false,
        isGitRepo: false,
        resolvedPath: null,
        source: "none",
        cloneRoot: "/Users/karel/zibby-clones",
      };
      render(<ProjectDetailScreen projectId="media-vault" />);
      expect(screen.getByTestId("local-state-missing-banner")).toBeInTheDocument();
      expect(screen.getByTestId("clone-project")).toBeDisabled();
    });

    it("dispatches the clone mutation when gitRemote is set", async () => {
      localState = {
        present: false,
        isGitRepo: false,
        resolvedPath: null,
        source: "none",
        cloneRoot: "/Users/karel/zibby-clones",
      };
      projectOverride = { gitRemote: "git@github.com:acme/media-vault.git" };
      render(<ProjectDetailScreen projectId="media-vault" />);
      const button = screen.getByTestId("clone-project");
      await userEvent.click(button);
      expect(cloneProjectMutate).toHaveBeenCalledWith({ params: { id: "media-vault" }, body: {} });
    });
  });
});
