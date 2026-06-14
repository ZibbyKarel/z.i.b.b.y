import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState, LoadingStateTestId } from "./LoadingState";

describe("LoadingState (44)", () => {
  it("renders the loading label", () => {
    render(<LoadingState label="Načítání…" />);
    expect(screen.getByTestId(LoadingStateTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
  });
});
