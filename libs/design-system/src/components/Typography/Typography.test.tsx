import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Typography, TypographyTestId } from "./Typography";

function renderTypo(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Typography", () => {
  it("renders its children", () => {
    renderTypo(<Typography type="text">Ahoj</Typography>);
    expect(screen.getByText("Ahoj")).toBeInTheDocument();
  });

  it("maps each type to the right element", () => {
    const { rerender } = renderTypo(<Typography type="pageTitle">A</Typography>);
    expect(screen.getByText("A").tagName).toBe("H1");

    rerender(<DesignSystemProvider theme="dark"><Typography type="title">A</Typography></DesignSystemProvider>);
    expect(screen.getByText("A").tagName).toBe("H2");

    rerender(<DesignSystemProvider theme="dark"><Typography type="subtitle">A</Typography></DesignSystemProvider>);
    expect(screen.getByText("A").tagName).toBe("H3");

    rerender(<DesignSystemProvider theme="dark"><Typography type="note">A</Typography></DesignSystemProvider>);
    expect(screen.getByText("A").tagName).toBe("DIV");
  });

  it("exposes the page title as a heading for a11y", () => {
    renderTypo(<Typography type="pageTitle">Přehled</Typography>);
    expect(screen.getByRole("heading", { level: 1, name: "Přehled" })).toBeInTheDocument();
  });

  it("applies secondary variant class", () => {
    renderTypo(<Typography type="text" variant="secondary">A</Typography>);
    expect(screen.getByText("A").className).toContain("text-foreground-dim");
  });

  it("defaults to the primary variant class", () => {
    renderTypo(<Typography type="text">A</Typography>);
    expect(screen.getByText("A").className).toContain("text-foreground");
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    renderTypo(
      <Typography type="title" ref={(el) => { node = el; }}>
        A
      </Typography>,
    );
    expect(node).toBeInstanceOf(HTMLHeadingElement);
  });

  it("passes through arbitrary props and sets the root testid", () => {
    renderTypo(<Typography type="note" aria-label="poznámka">A</Typography>);
    const el = screen.getByTestId(TypographyTestId.Root);
    expect(el).toHaveAttribute("aria-label", "poznámka");
  });
});
