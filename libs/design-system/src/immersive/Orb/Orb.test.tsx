import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Orb, OrbTestId } from "./Orb";

describe("Orb", () => {
  it("renders its positioned root (quiet no-op without WebGL)", () => {
    render(<Orb diameter={72} />);
    const root = screen.getByTestId(OrbTestId.Root);
    expect(root).toBeInTheDocument();
    // canvas = diameter / 0.8 = 90px
    expect(root).toHaveStyle({ width: "90px", height: "90px" });
  });

  it("does not mount a canvas under jsdom", () => {
    render(<Orb />);
    expect(screen.getByTestId(OrbTestId.Root).querySelector("canvas")).toBeNull();
  });

  it("forwards ref as a prop (React 19)", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Orb ref={ref} />);
    expect(ref.current).toBe(screen.getByTestId(OrbTestId.Root));
  });
});
