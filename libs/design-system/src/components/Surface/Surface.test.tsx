import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface, SurfaceTestId } from "./Surface";

describe("Surface", () => {
  it("renders its children inside the content layer", () => {
    render(
      <Surface>
        <span>shell</span>
      </Surface>,
    );
    expect(screen.getByTestId(SurfaceTestId.Content)).toHaveTextContent("shell");
  });

  it("renders no decorative overlay elements", () => {
    render(<Surface background="scene">x</Surface>);
    const root = screen.getByTestId(SurfaceTestId.Root);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(screen.getByTestId(SurfaceTestId.Content));
  });

  it("paints the scene gradient for the app shell", () => {
    render(<Surface background="scene">x</Surface>);
    expect(screen.getByTestId(SurfaceTestId.Root).className).toContain(
      "bg-[image:var(--gradient-scene)]",
    );
  });
});
