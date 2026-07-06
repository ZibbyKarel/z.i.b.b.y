import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconTile, IconTileTestId } from "./IconTile";
import { IconTestId } from "../Icon/Icon";

describe("IconTile", () => {
  it("renders the glyph at the size paired to the tile", () => {
    render(<IconTile glyph="bot" size="xl" />);
    const tile = screen.getByTestId(IconTileTestId.Root);
    expect(tile.style.width).toBe("56px");
    expect(tile.style.height).toBe("56px");
    expect(screen.getByTestId(IconTestId.Root)).toBeInTheDocument();
  });

  it("renders children instead of a glyph when provided", () => {
    render(
      <IconTile>
        <span>X</span>
      </IconTile>,
    );
    expect(screen.getByTestId(IconTileTestId.Root)).toHaveTextContent("X");
    expect(screen.queryByTestId(IconTestId.Root)).toBeNull();
  });

  it("acts as a button and fires onClick when interactive", async () => {
    const onClick = vi.fn();
    render(<IconTile interactive as="button" glyph="edit" onClick={onClick} />);
    const el = screen.getByTestId(IconTileTestId.Root);
    expect(el).toHaveRole("button");
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button when rendered as a button, so it never submits a form", () => {
    render(<IconTile as="button" glyph="edit" />);
    expect(screen.getByTestId(IconTileTestId.Root)).toHaveAttribute("type", "button");
  });

  it("lets an explicit type win over the default", () => {
    render(<IconTile as="button" glyph="edit" type="submit" />);
    expect(screen.getByTestId(IconTileTestId.Root)).toHaveAttribute("type", "submit");
  });

  it("does not render a type attribute when not a button", () => {
    render(<IconTile glyph="edit" />);
    expect(screen.getByTestId(IconTileTestId.Root)).not.toHaveAttribute("type");
  });

  it("renders the image with its alt text when src is provided", () => {
    render(<IconTile alt="Project logo" glyph="code" src="data:image/png;base64,AAA" />);
    const img = screen.getByTestId(IconTileTestId.Image);
    expect(img).toHaveAccessibleName("Project logo");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAA");
    expect(screen.queryByTestId(IconTestId.Root)).toBeNull();
  });

  it("falls back to the glyph when the image fails to load", () => {
    render(<IconTile alt="Project logo" glyph="code" src="data:image/png;base64,AAA" />);
    const img = screen.getByTestId(IconTileTestId.Image);
    fireEvent.error(img);
    expect(screen.queryByTestId(IconTileTestId.Image)).toBeNull();
    expect(screen.getByTestId(IconTestId.Root)).toBeInTheDocument();
  });

  it("renders the glyph when no src is provided", () => {
    render(<IconTile glyph="code" />);
    expect(screen.queryByTestId(IconTileTestId.Image)).toBeNull();
    expect(screen.getByTestId(IconTestId.Root)).toBeInTheDocument();
  });
});
