import { CardTestId, GlassSurfaceTestId } from "@zibby/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HudPanel } from "./HudPanel";

describe("HudPanel", () => {
  it("renders children", () => {
    render(<HudPanel>obsah</HudPanel>);
    expect(screen.getByText("obsah")).toBeInTheDocument();
  });

  it("renders a plain mono label title", () => {
    render(<HudPanel title="běžící agenti">x</HudPanel>);
    expect(screen.getByText("běžící agenti")).toBeInTheDocument();
  });

  it("renders an action slot", () => {
    render(
      <HudPanel action={<button>Přidat</button>} title="rozpočty">
        x
      </HudPanel>,
    );
    expect(screen.getByRole("button", { name: "Přidat" })).toBeInTheDocument();
  });

  // D7 (docs/hud2chat/DECISIONS.md): `surface` defaults to "hud" so every one
  // of the ~40 existing call sites (none of which pass `surface`) keeps
  // rendering the bordered Card exactly as before.
  it("defaults to the hud surface (Card), unchanged from today", () => {
    render(<HudPanel title="rozpočty">obsah</HudPanel>);
    expect(screen.getByTestId(CardTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(GlassSurfaceTestId.Root)).not.toBeInTheDocument();
  });

  it('renders the GlassSurface treatment when surface="glass", keeping the title/children contract', () => {
    render(
      <HudPanel surface="glass" title="rozpočty">
        obsah
      </HudPanel>,
    );
    expect(screen.getByTestId(GlassSurfaceTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(CardTestId.Root)).not.toBeInTheDocument();
    expect(screen.getByText("rozpočty")).toBeInTheDocument();
    expect(screen.getByText("obsah")).toBeInTheDocument();
  });
});
