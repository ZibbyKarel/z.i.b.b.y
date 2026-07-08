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

describe("LinkProjectDialog", () => {
  it("lists only projects not already linked to this company", async () => {
    projects = [
      { id: "linked", name: "Linked Co Project", path: "~/p/linked", companyId: "acme" },
      { id: "other", name: "Other Co Project", path: "~/p/other", companyId: "globex" },
      { id: "solo", name: "Solo Project", path: "~/p/solo" },
    ];
    render(<LinkProjectDialog companyId="acme" onClose={onClose} />);

    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const optionLabels = screen
      .getAllByTestId(DropdownTestId.Option)
      .map((el) => el.textContent);

    expect(optionLabels).toContain("Other Co Project");
    expect(optionLabels).toContain("Solo Project");
    expect(optionLabels).not.toContain("Linked Co Project");
  });

  it("selecting a candidate then confirming updates the project's companyId", async () => {
    projects = [{ id: "solo", name: "Solo Project", path: "~/p/solo" }];
    render(<LinkProjectDialog companyId="acme" onClose={onClose} />);

    expect(screen.getByTestId(LinkProjectDialogTestId.Confirm)).toBeDisabled();

    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const solo = options.find((el) => el.textContent === "Solo Project");
    await userEvent.click(solo!);

    expect(screen.getByTestId(LinkProjectDialogTestId.Confirm)).not.toBeDisabled();
    await userEvent.click(screen.getByTestId(LinkProjectDialogTestId.Confirm));

    expect(updateProjectMutate).toHaveBeenCalledWith(
      { params: { id: "solo" }, body: { companyId: "acme" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows the empty state with no select when every project already belongs to this company", () => {
    projects = [{ id: "linked", name: "Linked Co Project", path: "~/p/linked", companyId: "acme" }];
    render(<LinkProjectDialog companyId="acme" onClose={onClose} />);

    expect(screen.getByTestId(LinkProjectDialogTestId.NoCandidates)).toBeInTheDocument();
    expect(screen.queryByTestId(DropdownTestId.Trigger)).not.toBeInTheDocument();
    expect(screen.queryByTestId(LinkProjectDialogTestId.Confirm)).not.toBeInTheDocument();
  });
});
