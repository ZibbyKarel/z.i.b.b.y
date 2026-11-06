import userEvent from "@testing-library/user-event";
import { ButtonGroupTestId, DropdownTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { PrFilterControls } from "./PrFilterControls";

const teams = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("../../teams/queries", () => ({ useTeamsQuery: () => ({ data: teams.list }) }));
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: [] }) }));

describe("PrFilterControls teams", () => {
  it("shows an old org/team default as the configured option and lets it be unticked", async () => {
    teams.list = [{ id: "devrel", name: "DevRel", slug: "devrel-team" }];
    const onChange = vi.fn();
    renderWithProviders(
      <PrFilterControls onChange={onChange} pick={{ teams: ["shoptet/devrel-team"] }} />,
    );
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const option = screen.getByTestId(DropdownTestId.Option);
    expect(option).toHaveAttribute("aria-selected", "true");
    await userEvent.click(option);
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});

describe("PrFilterControls owner", () => {
  it("offers Moje/Cizí, selects one and clears it on a second click", async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(<PrFilterControls onChange={onChange} pick={{}} />);
    const others = screen.getByTestId(`${ButtonGroupTestId.Option}-others`);
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-mine`)).toHaveTextContent("Moje");
    expect(others).toHaveTextContent("Cizí");
    await userEvent.click(others);
    expect(onChange).toHaveBeenLastCalledWith({ owner: "others" });

    rerender(<PrFilterControls onChange={onChange} pick={{ owner: "others" }} />);
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-others`));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("shows a legacy mine flag as Moje and migrates it to owner on the next change", async () => {
    const onChange = vi.fn();
    renderWithProviders(<PrFilterControls onChange={onChange} pick={{ mine: true }} />);
    const mine = screen.getByTestId(`${ButtonGroupTestId.Option}-mine`);
    expect(mine).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-others`));
    expect(onChange).toHaveBeenLastCalledWith({ owner: "others" });
  });
});
