import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { PrFilterControls } from "./PrFilterControls";

describe("PrFilterControls teams", () => {
  it("shows an old org/team default as the configured option and lets it be unticked", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <PrFilterControls
        onChange={onChange}
        pick={{ teams: ["shoptet/devrel-team"] }}
        teams={[{ value: "devrel-team", label: "DevRel" }]}
      />,
    );
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const option = screen.getByTestId(DropdownTestId.Option);
    expect(option).toHaveAttribute("aria-selected", "true");
    await userEvent.click(option);
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});
