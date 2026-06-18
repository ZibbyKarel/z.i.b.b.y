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

vi.mock("./queries", () => ({
  useProjectQuery: () => ({ data: project, isPending: false, isError: false }),
  useProjectProfileQuery: () => ({ data: profile }),
  useProjectStandupQuery: () => ({ data: null }),
}));

vi.mock("./mutations", () => ({
  useUpdateProjectProfileMutation: () => ({ mutate: updateMutate, isPending: false }),
}));

// next/navigation — router.push is a no-op in tests
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  updateMutate.mockReset();
});

describe("ProfileScreen", () => {
  it("renders the project name from the query", () => {
    render(<ProfileScreen projectId="media-vault" />);
    expect(screen.getByText("media-vault")).toBeInTheDocument();
  });

  it("shows the person's name from the profile", () => {
    render(<ProfileScreen projectId="media-vault" />);
    expect(screen.getByDisplayValue("Jana")).toBeInTheDocument();
  });

  it("shows the standup time from the profile", () => {
    render(<ProfileScreen projectId="media-vault" />);
    expect(screen.getByDisplayValue("09:30")).toBeInTheDocument();
  });

  it("saves team on button click", async () => {
    render(<ProfileScreen projectId="media-vault" />);
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
    const nameInputsBefore = screen.getAllByTestId("person-name").length;
    await userEvent.click(screen.getByTestId("add-person"));
    expect(screen.getAllByTestId("person-name")).toHaveLength(nameInputsBefore + 1);
  });

  it("saves rhythm on button click", async () => {
    render(<ProfileScreen projectId="media-vault" />);
    await userEvent.click(screen.getByTestId("save-rhythm"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "media-vault" },
        body: expect.objectContaining({ daily_rhythm: expect.any(Object) }),
      }),
      expect.any(Object),
    );
  });
});
