import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrgConnector, OrgConnectorTestId } from "./OrgConnector";

describe("OrgConnector", () => {
  it("renders a muted vertical line by default", () => {
    render(<OrgConnector orientation="vertical" />);
    const el = screen.getByTestId(OrgConnectorTestId.Root);
    expect(el).toHaveClass("bg-border-strong");
    expect(el).toHaveClass("w-px");
  });

  it("turns --ink when active", () => {
    render(<OrgConnector active orientation="vertical" />);
    expect(screen.getByTestId(OrgConnectorTestId.Root)).toHaveClass("bg-ink");
  });

  it("renders transparent when hidden, keeping its layout slot", () => {
    render(<OrgConnector hidden orientation="vertical" />);
    expect(screen.getByTestId(OrgConnectorTestId.Root)).toHaveClass("bg-transparent");
  });

  it("sizes the vertical line by length", () => {
    render(<OrgConnector length={18} orientation="vertical" />);
    expect(screen.getByTestId(OrgConnectorTestId.Root)).toHaveClass("h-[18px]");
  });

  it("renders the horizontal bus absolutely positioned via style passthrough", () => {
    render(<OrgConnector orientation="horizontal" style={{ left: "10%", right: "10%" }} />);
    const el = screen.getByTestId(OrgConnectorTestId.Root);
    expect(el).toHaveClass("absolute", "h-px");
    expect(el).toHaveStyle({ left: "10%", right: "10%" });
  });
});
