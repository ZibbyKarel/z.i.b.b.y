import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Project, ProjectProfile } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../test/render";
import { ProfileScreen } from "./ProfileScreen";

const project: Project = {
  id: "media-vault",
  name: "media-vault",
  path: "~/Projects/media-vault",
};

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
const replace = vi.fn();
const push = vi.fn();

// `projectId` flips the query into new-project mode; the mock ignores the
// `enabled` option, so we just return the same project in both modes.
vi.mock("./queries", () => ({
  useProjectQuery: () => ({ data: project, isPending: false, isError: false }),
  useProjectProfileQuery: () => ({ data: profile }),
  useProjectStandupQuery: () => ({ data: null }),
  useProjectCategoriesQuery: () => ({ data: [{ name: "Dev", glyph: "code" }] }),
  useProjectIntegrationActivityQuery: () => ({ data: [] }),
  useCiStatusQuery: () => ({ data: [] }),
}));

vi.mock("./mutations", () => ({
  useUpdateProjectProfileMutation: () => ({ mutate: updateMutate, isPending: false }),
  useCreateProjectMutation: () => ({ mutate: createProjectMutate, isPending: false }),
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
  useDeleteProjectMutation: () => ({ mutate: deleteProjectMutate, isPending: false }),
  useSetProjectSecretsMutation: () => ({ mutate: setSecretsMutate, isPending: false }),
  useDeleteProjectSecretsMutation: () => ({ mutate: deleteSecretsMutate, isPending: false }),
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

// The `?tab=` the mocked URL reports; a deep-link test sets it before render.
let searchTab = "";

// next/navigation — router.push/replace are no-ops in tests; the detail reads the
// initial tab from `?tab=` (default empty → "overview" tab).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(searchTab ? `tab=${searchTab}` : ""),
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
  replace.mockReset();
  push.mockReset();
  searchTab = "";
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
    // The host path is now an editable field on the detail, not a dialog.
    expect(screen.getByDisplayValue("~/Projects/media-vault")).toBeInTheDocument();
  });

  it("saves the core record via the update mutation", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await userEvent.click(screen.getByTestId("save-basics"));
    expect(updateProjectMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "media-vault" },
        body: expect.objectContaining({ name: "media-vault", path: "~/Projects/media-vault" }),
      }),
    );
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
      await userEvent.type(screen.getByDisplayValue("~/Projects/"), "alpha");
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
  });
});
