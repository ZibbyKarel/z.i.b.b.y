import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar, FilterBarTestId } from "./FilterBar";

describe("FilterBar", () => {
  it("renders its children", () => {
    render(
      <FilterBar>
        <span>Company filter</span>
      </FilterBar>,
    );
    expect(screen.getByTestId(FilterBarTestId.Root)).toHaveTextContent("Company filter");
  });

  it("renders the clear button only when onClear is given, and fires it on click", async () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <FilterBar>
        <span />
      </FilterBar>,
    );
    expect(screen.queryByTestId(FilterBarTestId.Clear)).not.toBeInTheDocument();
    rerender(
      <FilterBar onClear={onClear}>
        <span />
      </FilterBar>,
    );
    await userEvent.click(screen.getByTestId(FilterBarTestId.Clear));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("renders the actions slot only when provided", () => {
    render(
      <FilterBar actions={<button type="button">New task</button>}>
        <span />
      </FilterBar>,
    );
    expect(screen.getByTestId(FilterBarTestId.Actions)).toHaveTextContent("New task");
  });
});
