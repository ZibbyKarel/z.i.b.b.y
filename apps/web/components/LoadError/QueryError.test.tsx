import { renderWithProviders as render, screen } from "../../test/render";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { LoadErrorTestId } from "./LoadError";
import { QueryError } from "./QueryError";

describe("QueryError (41) — catalog load error wired to the shared common strings", () => {
  it("renders the shared common load-error title (cs)", () => {
    render(<QueryError onRetry={() => {}} />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
  });

  it("calls onRetry from the retry button", async () => {
    const onRetry = vi.fn();
    render(<QueryError onRetry={onRetry} />);
    await userEvent.click(screen.getByTestId(LoadErrorTestId.Retry));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
