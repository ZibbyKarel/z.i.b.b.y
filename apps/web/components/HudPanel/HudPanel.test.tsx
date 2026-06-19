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
});
