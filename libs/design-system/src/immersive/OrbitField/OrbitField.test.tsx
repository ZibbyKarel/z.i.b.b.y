import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrbitField, OrbitFieldTestId } from "./OrbitField";

describe("OrbitField", () => {
  it("renders one dot per count", () => {
    render(<OrbitField baseRadius={40} color="#7aa5f8" count={4} seed="forge" />);
    expect(screen.getAllByTestId(OrbitFieldTestId.Dot)).toHaveLength(4);
  });

  it("renders no dots for count 0", () => {
    render(<OrbitField baseRadius={40} color="#66737f" count={0} seed="idle-sys" />);
    expect(screen.queryByTestId(OrbitFieldTestId.Dot)).toBeNull();
  });

  it("is deterministic — same seed yields the same dot sizes", () => {
    const { unmount } = render(
      <OrbitField baseRadius={50} color="#3fcf8e" count={3} seed="scout" />,
    );
    const first = screen.getAllByTestId(OrbitFieldTestId.Dot).map((d) => d.style.width);
    unmount();
    render(<OrbitField baseRadius={50} color="#3fcf8e" count={3} seed="scout" />);
    const second = screen.getAllByTestId(OrbitFieldTestId.Dot).map((d) => d.style.width);
    expect(second).toEqual(first);
  });
});
