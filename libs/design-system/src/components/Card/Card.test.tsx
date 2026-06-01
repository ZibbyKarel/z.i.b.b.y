import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Card, CardActions, CardContent, CardFooter, CardHeader, CardTestId } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Obsah karty</Card>);
    expect(screen.getByTestId(CardTestId.Root)).toHaveTextContent("Obsah karty");
  });

  it("renders the header slot", () => {
    render(<Card header="Nadpis">Obsah</Card>);
    expect(screen.getByTestId(CardTestId.Header)).toHaveTextContent("Nadpis");
  });

  it("renders the footer slot", () => {
    render(<Card footer="Zápatí">Obsah</Card>);
    expect(screen.getByTestId(CardTestId.Footer)).toHaveTextContent("Zápatí");
  });

  it("forwards a ref", () => {
    let node: HTMLDivElement | null = null;
    render(<Card ref={(el) => { node = el; }}>x</Card>);
    expect(node).toBeInstanceOf(HTMLDivElement);
  });

  it("applies translucent background, dashed border and shadow", () => {
    render(
      <Card animate="scale" background="panel" borderStyle="dashed" shadow="dropdown">
        x
      </Card>,
    );
    const cls = screen.getByTestId(CardTestId.Root).className;
    expect(cls).toContain("bg-surface-panel");
    expect(cls).toContain("border-dashed");
    expect(cls).toContain("shadow-dropdown");
    expect(cls).toContain("animate-scale-in");
  });

  it("CardHeader renders its children", () => {
    render(<Card><CardHeader>Titulek</CardHeader></Card>);
    expect(screen.getByTestId(CardTestId.Header)).toHaveTextContent("Titulek");
  });

  it("CardContent renders its children", () => {
    render(<Card><CardContent>obsah</CardContent></Card>);
    expect(screen.getByTestId(CardTestId.Content)).toHaveTextContent("obsah");
  });

  it("CardFooter renders its children", () => {
    render(<Card><CardFooter>zápatí</CardFooter></Card>);
    expect(screen.getByTestId(CardTestId.Footer)).toHaveTextContent("zápatí");
  });

  it("CardActions renders its children via CardFooter", () => {
    render(<Card><CardActions><button>OK</button></CardActions></Card>);
    const footer = screen.getByTestId(CardTestId.Footer);
    expect(within(footer).getByRole("button", { name: "OK" })).toBeInTheDocument();
  });
});
