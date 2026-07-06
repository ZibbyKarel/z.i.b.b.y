import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntityHero, EntityHeroTestId } from "./EntityHero";

describe("EntityHero", () => {
  it("renders the image when one is supplied", () => {
    render(<EntityHero glyph="compass" image="/avatars/architect.png" name="Architekt" />);
    const img = screen.getByTestId(EntityHeroTestId.Image);
    expect(img).toHaveAttribute("src", "/avatars/architect.png");
    expect(screen.getByTestId(EntityHeroTestId.Name)).toHaveTextContent("Architekt");
  });

  it("falls back to the glyph when there is no image", () => {
    render(<EntityHero glyph="compass" name="Architekt" />);
    expect(screen.queryByTestId(EntityHeroTestId.Image)).toBeNull();
    expect(screen.getByTestId(EntityHeroTestId.GlyphFallback)).toBeInTheDocument();
  });

  it("falls back to the glyph when the image fails to load", () => {
    render(<EntityHero glyph="compass" image="/broken.png" name="X" />);
    fireEvent.error(screen.getByTestId(EntityHeroTestId.Image));
    expect(screen.getByTestId(EntityHeroTestId.GlyphFallback)).toBeInTheDocument();
  });

  it("emits a data URI via onUpload when editable", async () => {
    const onUpload = vi.fn();
    render(<EntityHero editable glyph="compass" name="X" onUpload={onUpload} />);
    const input = screen.getByTestId(EntityHeroTestId.FileInput) as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.stringMatching(/^data:/)));
  });

  it("hides upload/remove controls when not editable", () => {
    render(<EntityHero glyph="compass" image="/a.png" name="X" />);
    expect(screen.queryByTestId(EntityHeroTestId.FileInput)).toBeNull();
    expect(screen.queryByTestId(EntityHeroTestId.RemoveButton)).toBeNull();
  });
});
