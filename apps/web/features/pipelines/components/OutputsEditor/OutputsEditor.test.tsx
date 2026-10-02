import { renderWithProviders as render, screen } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OutputsEditor, outputsValid } from "./OutputsEditor";

describe("outputsValid", () => {
  it("mirrors the folder contract", () => {
    expect(outputsValid([{ type: "folder", from: "book", to: "~/x" }])).toBe(true);
    expect(outputsValid([{ type: "folder", from: "book", to: "rel" }])).toBe(false);
    expect(outputsValid([{ type: "folder", from: "../b", to: "/x" }])).toBe(false);
  });
});

describe("OutputsEditor", () => {
  it("adds a default folder sink and removes a row", async () => {
    const onChange = vi.fn();
    render(
      <OutputsEditor
        onChange={onChange}
        outputs={[{ type: "pr", from: "a.md" }]}
        produces={["a.md"]}
      />,
    );
    await userEvent.click(screen.getByTestId("output-add"));
    expect(onChange).toHaveBeenCalledWith([
      { type: "pr", from: "a.md" },
      { type: "folder", from: "book", to: "" },
    ]);
    await userEvent.click(screen.getByTestId("output-remove-0"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("edits a folder target", async () => {
    const onChange = vi.fn();
    render(
      <OutputsEditor
        onChange={onChange}
        outputs={[{ type: "folder", from: "book", to: "" }]}
        produces={[]}
      />,
    );
    await userEvent.type(screen.getByTestId("output-to-0"), "/");
    expect(onChange).toHaveBeenCalledWith([{ type: "folder", from: "book", to: "/" }]);
  });
});
