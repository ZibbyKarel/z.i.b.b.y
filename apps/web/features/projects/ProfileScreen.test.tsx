import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Project, ProjectLocalState, ProjectProfile } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../test/render";
import { ProfileScreen } from "./ProfileScreen";

const project: Project = {
  id: "media-vault",
  name: "media-vault",
  path: "~/Projects/media-vault",
};

/** Per-test override merged over `project` (e.g. to add/remove `gitRemote`
 * without mutating the shared fixture). Reset in `beforeEach`. */
let projectOverride: Partial<Project> = {};

const profile: ProjectProfile = {
  identity: {
    people: [{ name: "Jana", role: "PM", vip: true }],
  },
  autonomy_policy: {
    can_do_alone: ["reply"],
    respond_as: "draft_only",
  },
  daily_rhythm: {
    standup_time: "09:30",
    active_hours: "09:00-18:00",
  },
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

/** THIS machine's local-clone resolution (Phase 76/77) — individual tests
 * override this to exercise the missing-clone banner / cloned-from-cloneRoot chip. */
let localState: ProjectLocalState | undefined = {
  present: true,
  isGitRepo: true,
  resolvedPath: project.path ?? null,
  source: "path",
  cloneRoot: "/Users/karel/zibby-clones",
};

// `projectId` flips the query into new-project mode; the mock ignores the
// `enabled` option, so we just return the same project in both modes.
vi.mock("./queries", () => ({
  useProjectQuery: () => ({ data: { ...project, ...projectOverride }, isPending: false, isError: false }),
  useProjectProfileQuery: () => ({ data: profile }),
  useProjectStandupQuery: () => ({ data: null }),
  useProjectLocalStateQuery: () => ({ data: localState }),
  useProjectCategoriesQuery: () => ({ data: [{ name: "Dev", glyph: "code" }] }),
  useProjectIntegrationActivityQuery: () => ({ data: [] }),
  useCiStatusQuery: () => ({ data: [] }),
  useProjectTaskStats: () => ({ total: 0, groups: [] }),
  // Phase 72's company-effective panel; its own dedicated tests cover the
  // merged-data rendering in isolation (see `ProjectCompanyPanel.test.tsx`).
  useResolvedProjectQuery: () => ({ data: { people: [], integrations: [] } }),
  // Phase 78's PR overview panel + header count badge; their own dedicated
  // tests cover the rendering in isolation (see `ProjectPullRequestsPanel.test.tsx`).
  useProjectPrsQuery: () => ({ data: [] }),
}));

// Phase 72's company selector reads the registry to populate its options; Phase
// 75's new-mode "linked to" note resolves the company name from the same list.
let companies: { id: string; name: string }[] = [];
vi.mock("../companies", () => ({
  useCompaniesQuery: () => ({ data: companies }),
}));

// Individual tests flip this to exercise the clone button's loading state
// (Phase 98 — the button stays clickable-suppressed via `loading`, never `disabled`).
let cloneIsPending = false;

vi.mock("./mutations", () => ({
  useUpdateProjectProfileMutation: () => ({ mutate: updateMutate, isPending: false }),
  useCreateProjectMutation: () => ({ mutate: createProjectMutate, isPending: false }),
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
  useDeleteProjectMutation: () => ({ mutate: deleteProjectMutate, isPending: false }),
  useSetProjectSecretsMutation: () => ({ mutate: setSecretsMutate, isPending: false }),
  useDeleteProjectSecretsMutation: () => ({ mutate: deleteSecretsMutate, isPending: false }),
  useCloneProjectMutation: () => ({ mutate: cloneProjectMutate, isPending: cloneIsPending }),
  useMergeProjectPrMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The detail now mounts the project's integrations + inbox; stub those data hooks.
vi.mock("../integrations/queries", () => ({
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

vi.mock("../integrations/mutations", () => ({
  useCreateIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCredentialsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useTestIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The `?tab=`/`?companyId=` the mocked URL reports; individual tests set these
// before render.
let searchTab = "";
let searchCompanyId = "";

// next/navigation — router.push/replace are no-ops in tests; the detail reads the
// initial tab from `?tab=` (default empty → "overview" tab) and, in new-project
// mode, an optional pre-link `?companyId=` (Phase 75).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (searchTab) params.set("tab", searchTab);
    if (searchCompanyId) params.set("companyId", searchCompanyId);
    return params;
  },
}));

/** The Team/Autonomy/Rhythm/Standup sections live under the "Profile" tab. */
async function openProfileTab() {
  await userEvent.click(screen.getByTestId("tabs-tab-profile"));
}

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
  searchTab = "";
  searchCompanyId = "";
  companies = [];
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

describe("ProfileScreen", () => {
  it("renders the project name from the query", () => {
    render(<ProfileScreen projectId="media-vault" />);
    expect(screen.getByText("media-vault")).toBeInTheDocument();
  });

  it("shows the person's name from the profile", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await openProfileTab();
    expect(screen.getByDisplayValue("Jana")).toBeInTheDocument();
  });

  it("shows the standup time from the profile", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await openProfileTab();
    expect(screen.getByDisplayValue("09:30")).toBeInTheDocument();
  });

  it("edits the core record in place (the dialog is gone)", () => {
    render(<ProfileScreen projectId="media-vault" />);
    // The name is now an editable field on the detail, not a dialog.
    expect(screen.getByDisplayValue("media-vault")).toBeInTheDocument();
  });

  it("shows the machine-local path read-only in the header subtitle (Phase 98 — no editable path field)", () => {
    render(<ProfileScreen projectId="media-vault" />);
    expect(screen.getByText("~/Projects/media-vault")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("~/Projects/media-vault")).not.toBeInTheDocument();
  });

  it("saves the core record via the update mutation (no path in the body)", async () => {
    render(<ProfileScreen projectId="media-vault" />);
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

  it("renders no subtitle when the project has no local path", () => {
    projectOverride = { path: undefined };
    render(<ProfileScreen projectId="media-vault" />);
    expect(screen.queryByText("~/Projects/media-vault")).not.toBeInTheDocument();
  });

  it("saves team on button click", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await openProfileTab();
    await userEvent.click(screen.getByTestId("save-team"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "media-vault" },
        body: expect.objectContaining({ identity: expect.any(Object) }),
      }),
      expect.any(Object),
    );
  });

  it("saves a person's comms style into the identity body", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await openProfileTab();
    await userEvent.type(screen.getByTestId("person-comms-style"), "Terse");
    await userEvent.click(screen.getByTestId("save-team"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          identity: {
            people: [expect.objectContaining({ name: "Jana", comms_style: "Terse" })],
          },
        },
      }),
      expect.any(Object),
    );
  });

  it("adds a new person row", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await openProfileTab();
    const nameInputsBefore = screen.getAllByTestId("person-name").length;
    await userEvent.click(screen.getByTestId("add-person"));
    expect(screen.getAllByTestId("person-name")).toHaveLength(nameInputsBefore + 1);
  });

  it("lists the project's integrations with an add control", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await userEvent.click(screen.getByTestId("tabs-tab-integrations"));
    expect(screen.getByText("Team Slack")).toBeInTheDocument();
    expect(screen.getByTestId("add-integration")).toBeInTheDocument();
  });

  it("saves rhythm on button click", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await openProfileTab();
    await userEvent.click(screen.getByTestId("save-rhythm"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "media-vault" },
        body: expect.objectContaining({ daily_rhythm: expect.any(Object) }),
      }),
      expect.any(Object),
    );
  });

  it("deep-links straight to a tab from the ?tab= URL", async () => {
    searchTab = "integrations";
    render(<ProfileScreen projectId="media-vault" />);
    // Lands on the integrations tab without a click — the URL is the source of truth.
    expect(await screen.findByText("Team Slack")).toBeInTheDocument();
    expect(screen.queryByTestId("save-team")).not.toBeInTheDocument();
  });

  it("writes the chosen tab back to the URL for shareability", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await openProfileTab();
    expect(replace).toHaveBeenCalledWith("/projects/media-vault?tab=profile");
  });

  describe("new project mode", () => {
    it("shows only the basics panel — no team/integrations until saved", () => {
      render(<ProfileScreen />);
      expect(screen.getByTestId("save-basics")).toBeInTheDocument();
      expect(screen.queryByTestId("save-team")).not.toBeInTheDocument();
      expect(screen.queryByTestId("add-integration")).not.toBeInTheDocument();
    });

    it("creates the project and redirects to its detail page", async () => {
      render(<ProfileScreen />);
      const nameField = screen.getByPlaceholderText("media-vault");
      await userEvent.type(nameField, "Alpha");
      await userEvent.click(screen.getByTestId("save-basics"));
      expect(createProjectMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ id: "alpha", name: "Alpha" }),
        }),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    describe("pre-linked to a company via ?companyId= (Phase 75)", () => {
      beforeEach(() => {
        searchCompanyId = "acme";
        companies = [{ id: "acme", name: "Acme" }];
      });

      it("shows a pending-link note naming the company", () => {
        render(<ProfileScreen />);
        expect(screen.getByTestId("new-project-linked-to")).toHaveTextContent("Acme");
      });

      it("includes the companyId in the create body on save", async () => {
        render(<ProfileScreen />);
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

  describe("local-clone state (Phase 76/77)", () => {
    it("shows no banner and no chip when present at the canonical path", () => {
      localState = {
        present: true,
        isGitRepo: true,
        resolvedPath: project.path ?? null,
        source: "path",
        cloneRoot: "/Users/karel/zibby-clones",
      };
      render(<ProfileScreen projectId="media-vault" />);
      expect(screen.queryByTestId("local-state-missing-banner")).not.toBeInTheDocument();
      expect(screen.queryByTestId("cloned-from-clone-root")).not.toBeInTheDocument();
    });

    it("shows the cloned-from-cloneRoot chip when present via the cloneRoot copy", () => {
      localState = {
        present: true,
        isGitRepo: true,
        resolvedPath: "/Users/karel/zibby-clones/media-vault",
        source: "cloneRoot",
        cloneRoot: "/Users/karel/zibby-clones",
      };
      render(<ProfileScreen projectId="media-vault" />);
      expect(screen.getByTestId("cloned-from-clone-root")).toBeInTheDocument();
    });

    it("shows the missing-clone banner with the clone button disabled without a gitRemote", () => {
      localState = {
        present: false,
        isGitRepo: false,
        resolvedPath: null,
        source: "none",
        cloneRoot: "/Users/karel/zibby-clones",
      };
      render(<ProfileScreen projectId="media-vault" />);
      expect(screen.getByTestId("local-state-missing-banner")).toBeInTheDocument();
      expect(screen.getByTestId("clone-project")).toBeDisabled();
    });

    it("enables the clone button and dispatches the clone mutation when gitRemote is set", async () => {
      localState = {
        present: false,
        isGitRepo: false,
        resolvedPath: null,
        source: "none",
        cloneRoot: "/Users/karel/zibby-clones",
      };
      projectOverride = { gitRemote: "git@github.com:acme/media-vault.git" };
      render(<ProfileScreen projectId="media-vault" />);
      const button = screen.getByTestId("clone-project");
      expect(button).not.toBeDisabled();
      await userEvent.click(button);
      expect(cloneProjectMutate).toHaveBeenCalledWith({
        params: { id: "media-vault" },
        body: {},
      });
    });

    it("shows the clone button as loading (not disabled) while the clone mutation is pending", async () => {
      localState = {
        present: false,
        isGitRepo: false,
        resolvedPath: null,
        source: "none",
        cloneRoot: "/Users/karel/zibby-clones",
      };
      projectOverride = { gitRemote: "git@github.com:acme/media-vault.git" };
      cloneIsPending = true;
      render(<ProfileScreen projectId="media-vault" />);
      const button = screen.getByTestId("clone-project");
      // Loading suppresses clicks without disabling the button (Phase 98).
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      await userEvent.click(button);
      expect(cloneProjectMutate).not.toHaveBeenCalled();
    });
  });
});
