import userEvent from "@testing-library/user-event";
import { ButtonGroupTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import { PrFilterControlsTestId } from "./PrFilterControls";
import { PrsWidgetSettings } from "./PrsWidgetSettings";

vi.mock("../../inbox/queries", () => ({
  useInboxPrsQuery: () => ({
    data: { prs: [{ reviewTeam: "o/blue" }, { reviewTeam: "o/red" }], errors: [] },
  }),
}));

const widget = (prFilters?: BridgeWidget["prFilters"]) =>
  ({ id: "w", type: "prs", prFilters }) as unknown as BridgeWidget;

describe("PrsWidgetSettings", () => {
  it("writes picks to draft.prFilters and omits emptied groups", async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <PrsWidgetSettings draft={widget()} onChange={onChange} />,
    );
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-failing`));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ prFilters: { ci: ["failing"] } }),
    );
    await userEvent.click(screen.getByTestId(PrFilterControlsTestId.Mine));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ prFilters: { mine: true } }),
    );

    // deselecting the last pick removes prFilters entirely
    rerender(<PrsWidgetSettings draft={widget({ ci: ["failing"] })} onChange={onChange} />);
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-failing`));
    expect(onChange.mock.lastCall?.[0].prFilters).toBeUndefined();
  });

  it("offers the teams of the fetched PRs", () => {
    renderWithProviders(
      <PrsWidgetSettings draft={widget({ teams: ["o/green"] })} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Týmy")).toBeInTheDocument();
  });
});
