import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Typography, TypographyTestId } from "./Typography";

describe("Typography", () => {
  it("renders its children", () => {
    render(<Typography type="text">Ahoj</Typography>);
    expect(screen.getByText("Ahoj")).toBeInTheDocument();
  });

  it("maps each type to the right element", () => {
    const { rerender } = render(<Typography type="pageTitle">A</Typography>);
    expect(screen.getByText("A").tagName).toBe("H1");

    rerender(<Typography type="title">A</Typography>);
    expect(screen.getByText("A").tagName).toBe("H2");

    rerender(<Typography type="subtitle">A</Typography>);
    expect(screen.getByText("A").tagName).toBe("H3");

    rerender(<Typography type="note">A</Typography>);
    expect(screen.getByText("A").tagName).toBe("DIV");
  });

  it("exposes the page title as a heading for a11y", () => {
    render(<Typography type="pageTitle">Přehled</Typography>);
    expect(screen.getByRole("heading", { level: 1, name: "Přehled" })).toBeInTheDocument();
  });

  it("applies secondary variant class", () => {
    render(<Typography type="text" variant="secondary">A</Typography>);
    expect(screen.getByText("A").className).toContain("text-foreground-dim");
  });

  it("defaults to the primary variant class", () => {
    render(<Typography type="text">A</Typography>);
    expect(screen.getByText("A").className).toContain("text-foreground");
  });

  it("applies a semantic tone over the variant colour", () => {
    render(<Typography tone="ok" type="note">A</Typography>);
    const el = screen.getByText("A");
    expect(el.className).toContain("text-ok");
    expect(el.className).not.toContain("text-foreground");
  });

  it("overrides the rendered element via as", () => {
    render(<Typography as="span" type="note">A</Typography>);
    expect(screen.getByText("A").tagName).toBe("SPAN");
  });

  it("applies size, mono, uppercase and truncate", () => {
    render(
      <Typography mono truncate uppercase size="xs" type="note">
        A
      </Typography>,
    );
    const el = screen.getByText("A");
    expect(el.className).toContain("font-mono");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("truncate");
    expect(el.style.fontSize).toBe("var(--text-xs)");
  });

  it("forwards a ref", () => {
    let node: HTMLElement | null = null;
    render(
      <Typography ref={(el) => { node = el; }} type="title">
        A
      </Typography>,
    );
    expect(node).toBeInstanceOf(HTMLHeadingElement);
  });

  it("passes through arbitrary props and sets the root testid", () => {
    render(<Typography aria-label="poznámka" type="note">A</Typography>);
    const el = screen.getByTestId(TypographyTestId.Root);
    expect(el).toHaveAttribute("aria-label", "poznámka");
  });
});
