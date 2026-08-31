import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import type { Team } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ProjectTeamPanel } from "./ProjectTeamPanel";

const teams: Team[] = [
  { id: "platform", name: "Platform" },
  { id: "growth", name: "Growth" },
];

const updateProjectMutate = vi.fn();

vi.mock("../../teams", () => ({
  useTeamsQuery: () => ({ data: teams }),
}));

vi.mock("../mutations", () => ({
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
}));

describe("ProjectTeamPanel", () => {
  it("sets teamId via the update mutation when a team is picked", async () => {
    updateProjectMutate.mockReset();
    render(<ProjectTeamPanel projectId="solo" />);

    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const growthOption = options.find((o) => o.textContent === "Growth");
    await userEvent.click(growthOption!);

    expect(updateProjectMutate).toHaveBeenCalledWith({
      params: { id: "solo" },
      body: { teamId: "growth" },
    });
  });

  it("clears teamId (sends null) when 'no team' is picked", async () => {
    updateProjectMutate.mockReset();
    render(<ProjectTeamPanel projectId="linked" teamId="platform" />);

    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option);
    const noTeamOption = options.find((o) => o.textContent === "Bez týmu");
    await userEvent.click(noTeamOption!);

    expect(updateProjectMutate).toHaveBeenCalledWith({
      params: { id: "linked" },
      body: { teamId: null },
    });
  });
});
