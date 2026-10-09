import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "./DesignSystemProvider";
import { useResolvedTheme } from "./hooks";

function Probe() {
  return <span data-testid="resolved">{useResolvedTheme()}</span>;
}

describe("useResolvedTheme", () => {
  it("returns the explicit theme the provider was given", () => {
    render(
      <DesignSystemProvider theme="light">
        <Probe />
      </DesignSystemProvider>,
    );
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });

  it("resolves `system` (jsdom has no matchMedia → dark)", () => {
    render(
      <DesignSystemProvider theme="system">
        <Probe />
      </DesignSystemProvider>,
    );
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });

  it("falls back to dark outside a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });
});
