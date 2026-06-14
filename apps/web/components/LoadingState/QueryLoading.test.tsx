import { renderWithProviders as render, screen } from "../../test/render";
import { describe, expect, it } from "vitest";
import { LoadingStateTestId } from "./LoadingState";
import { QueryLoading } from "./QueryLoading";

describe("QueryLoading (44)", () => {
  it("renders the loading state with the shared common.loading label (cs)", () => {
    render(<QueryLoading />);
    expect(screen.getByTestId(LoadingStateTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
  });
});
