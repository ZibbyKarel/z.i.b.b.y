import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewChainDialog, NewChainDialogTestId } from "./NewChainDialog";

const PIPELINES = [
  { id: "nightly-research", name: "Nightly research" },
  { id: "build-feature", name: "Build feature" },
];

describe("NewChainDialog", () => {
  it("composes ordered steps, slugs the id and submits the create body", async () => {
    const onCreate = vi.fn();
    render(<NewChainDialog onClose={() => {}} onCreate={onCreate} pipelines={PIPELINES} />);

    await userEvent.type(screen.getByTestId(NewChainDialogTestId.Name), "Research → Build");
    await userEvent.type(
      screen.getByTestId(NewChainDialogTestId.Instructions),
      "Research topic X.",
    );
    await userEvent.click(screen.getByTestId(NewChainDialogTestId.AddStep));
    // Step 2 defaults to the first pipeline; switch it to build-feature.
    const steps = screen.getAllByLabelText(/Krok \d/);
    expect(steps).toHaveLength(2);
    await userEvent.click(steps[1]!);
    await userEvent.click(screen.getByRole("option", { name: "Build feature" }));

    await userEvent.click(screen.getByTestId(NewChainDialogTestId.Submit));

    expect(onCreate).toHaveBeenCalledWith({
      id: "research-build",
      name: "Research → Build",
      instructions: "Research topic X.",
      steps: [{ pipeline: "nightly-research" }, { pipeline: "build-feature" }],
    });
  });

  it("disables submit while the name is empty", () => {
    render(<NewChainDialog onClose={() => {}} onCreate={() => {}} pipelines={PIPELINES} />);
    expect(screen.getByTestId(NewChainDialogTestId.Submit)).toBeDisabled();
  });

  it("a step can be removed, but never the last one", async () => {
    render(<NewChainDialog onClose={() => {}} onCreate={() => {}} pipelines={PIPELINES} />);
    await userEvent.click(screen.getByTestId(NewChainDialogTestId.AddStep));
    const removeButtons = screen.getAllByRole("button", { name: /Odebrat krok/ });
    expect(removeButtons).toHaveLength(2);
    await userEvent.click(removeButtons[1]!);
    expect(screen.getAllByRole("button", { name: /Odebrat krok/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Odebrat krok 1/ })).toBeDisabled();
  });
});
