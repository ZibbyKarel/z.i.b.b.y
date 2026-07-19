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

  it("renders children as an overlay over the avatar, in place of the default name block", () => {
    render(
      <EntityHero glyph="flow" image="/avatars/delivery.png">
        <div>run header content</div>
      </EntityHero>,
    );
    // The avatar still fills the band as a background…
    expect(screen.getByTestId(EntityHeroTestId.Image)).toHaveAttribute(
      "src",
      "/avatars/delivery.png",
    );
    // …but the overlay hosts the caller's content, and the default name block is gone.
    expect(screen.getByTestId(EntityHeroTestId.Overlay)).toHaveTextContent("run header content");
    expect(screen.queryByTestId(EntityHeroTestId.Name)).toBeNull();
  });

  it("keeps the glyph fallback behind the children overlay when there is no image", () => {
    render(
      <EntityHero glyph="flow">
        <div>run header content</div>
      </EntityHero>,
    );
    expect(screen.queryByTestId(EntityHeroTestId.Image)).toBeNull();
    expect(screen.getByTestId(EntityHeroTestId.GlyphFallback)).toBeInTheDocument();
    expect(screen.getByTestId(EntityHeroTestId.Overlay)).toHaveTextContent("run header content");
  });

  it("defaults to a full-bleed image (imageBleed omitted)", () => {
    render(<EntityHero glyph="flow" image="/avatars/delivery.png" name="X" />);
    const img = screen.getByTestId(EntityHeroTestId.Image);
    expect(img).toHaveClass("inset-0", "h-full", "w-full");
    expect(img).not.toHaveClass("right-0");
  });

  it("shows the whole image right-anchored and scaled to height when imageBleed is band", () => {
    render(<EntityHero glyph="flow" image="/avatars/delivery.png" imageBleed="band" name="X" />);
    const img = screen.getByTestId(EntityHeroTestId.Image);
    // Whole image (no crop), right-anchored, height = band height, width from aspect ratio.
    expect(img).toHaveClass(
      "absolute",
      "inset-y-0",
      "right-0",
      "h-full",
      "w-auto",
      "object-contain",
    );
    expect(img).not.toHaveClass("w-full", "w-1/2", "object-cover");
  });

  describe("showIdentity (D13, docs/hud2chat/DECISIONS.md)", () => {
    it("renders the name/desc overlay by default (showIdentity omitted)", () => {
      render(<EntityHero desc="Plans the loop." glyph="compass" name="Architekt" />);
      expect(screen.getByTestId(EntityHeroTestId.Name)).toHaveTextContent("Architekt");
      expect(screen.getByText("Plans the loop.")).toBeInTheDocument();
    });

    it("suppresses the name/desc overlay when showIdentity is false", () => {
      render(
        <EntityHero
          desc="Plans the loop."
          glyph="compass"
          image="/avatars/architect.png"
          name="Architekt"
          showIdentity={false}
        />,
      );
      // The image/glyph band itself still renders…
      expect(screen.getByTestId(EntityHeroTestId.Image)).toHaveAttribute(
        "src",
        "/avatars/architect.png",
      );
      // …but the identity block is gone entirely.
      expect(screen.queryByTestId(EntityHeroTestId.Name)).toBeNull();
      expect(screen.queryByText("Plans the loop.")).toBeNull();
    });

    it("keeps the glyph fallback when showIdentity is false and there is no image", () => {
      render(<EntityHero glyph="compass" name="Architekt" showIdentity={false} />);
      expect(screen.getByTestId(EntityHeroTestId.GlyphFallback)).toBeInTheDocument();
      expect(screen.queryByTestId(EntityHeroTestId.Name)).toBeNull();
    });

    it("has no effect when children override the overlay", () => {
      render(
        <EntityHero glyph="flow" image="/avatars/delivery.png" showIdentity={false}>
          <div>run header content</div>
        </EntityHero>,
      );
      expect(screen.getByTestId(EntityHeroTestId.Overlay)).toHaveTextContent("run header content");
      expect(screen.queryByTestId(EntityHeroTestId.Name)).toBeNull();
    });
  });
});
