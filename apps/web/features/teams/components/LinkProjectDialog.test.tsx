import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import type { Project } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import { LinkProjectDialog, LinkProjectDialogTestId } from "./LinkProjectDialog";

let projects: Project[] = [];
const updateProjectMutate = vi.fn();
const onClose = vi.fn();

vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: projects }),
}));

vi.mock("../../projects/mutations", () => ({
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
}));

beforeEach(() => {
  updateProjectMutate.mockReset();
  onClose.mockReset();
  projects = [];
});

describe("teams LinkProjectDialog", () => {
  it("lists only projects not already linked to this team", async () => {
    projects = [
      { id: "linked", name: "Linked Team Project", path: "~/p/linked", teamId: "platform" },
      { id: "other", name: "Other Team Project", path: "~/p/other", teamId: "growth" },
      { id: "solo", name: "Solo Project", path: "~/p/solo" },
    ];
    render(<LinkProjectDialog onClose={onClose} teamId="platform" />);

    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const optionLabels = screen.getAllByTestId(DropdownTestId.Option).map((el) => el.textContent);

    expect(optionLabels).toContain("Other Team Project");
    expect(optionLabels).toContain("Solo Project");
    expect(optionLabels).not.toContain("Linked Team Project");
  });

  it("selecting a candidate then confirming updates the project's teamId", async () => {
    projects = [{ id: "solo", name: "Solo Project", path: "~/p/solo" }];
    render(<LinkProjectDialog onClose={onClose} teamId="platform" />);

    expect(screen.getByTestId(LinkProjectDialogTestId.Confirm)).toBeDisabled();

    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const solo = options.find((el) => el.textContent === "Solo Project");
    await userEvent.click(solo!);

    expect(screen.getByTestId(LinkProjectDialogTestId.Confirm)).not.toBeDisabled();
    await userEvent.click(screen.getByTestId(LinkProjectDialogTestId.Confirm));

    expect(updateProjectMutate).toHaveBeenCalledWith(
      { params: { id: "solo" }, body: { teamId: "platform" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows the empty state with no select when every project already belongs to this team", () => {
    projects = [
      { id: "linked", name: "Linked Team Project", path: "~/p/linked", teamId: "platform" },
    ];
    render(<LinkProjectDialog onClose={onClose} teamId="platform" />);

    expect(screen.getByTestId(LinkProjectDialogTestId.NoCandidates)).toBeInTheDocument();
    expect(screen.queryByTestId(DropdownTestId.Trigger)).not.toBeInTheDocument();
    expect(screen.queryByTestId(LinkProjectDialogTestId.Confirm)).not.toBeInTheDocument();
  });
});
