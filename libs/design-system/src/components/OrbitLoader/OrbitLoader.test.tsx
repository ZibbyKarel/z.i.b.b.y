import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { OrbitLoader, OrbitLoaderTestId } from "./OrbitLoader";

describe("OrbitLoader", () => {
  it("renders a status role with a default accessible name", () => {
    render(<OrbitLoader />);
    const root = screen.getByTestId(OrbitLoaderTestId.Root);
    expect(root).toHaveRole("status");
    expect(root).toHaveAccessibleName("Loading");
  });

  it("uses the label as both caption and accessible name", () => {
    render(<OrbitLoader label="Načítám…" />);
    expect(screen.getByTestId(OrbitLoaderTestId.Root)).toHaveAccessibleName("Načítám…");
    expect(screen.getByTestId(OrbitLoaderTestId.Label)).toHaveTextContent("Načítám…");
  });

  it("omits the caption when no label is given", () => {
    render(<OrbitLoader />);
    expect(screen.queryByTestId(OrbitLoaderTestId.Label)).toBeNull();
  });

  it("scales the orbit box with the size token", () => {
    const { rerender } = render(<OrbitLoader size="sm" />);
    expect(screen.getByTestId(OrbitLoaderTestId.Orbit)).toHaveStyle({ width: "28px" });
    rerender(<OrbitLoader size="lg" />);
    expect(screen.getByTestId(OrbitLoaderTestId.Orbit)).toHaveStyle({ width: "96px" });
  });

  it("suppresses animation under reduced motion", () => {
    render(<OrbitLoader />);
    expect(screen.getByTestId(OrbitLoaderTestId.Orbit).firstChild).toHaveClass(
      "motion-reduce:animate-none",
    );
  });

  it("forwards a ref to the root", () => {
    const ref = createRef<HTMLElement>();
    render(<OrbitLoader ref={ref} />);
    expect(ref.current).toBe(screen.getByTestId(OrbitLoaderTestId.Root));
  });
});
