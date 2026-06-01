import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Card, CardHeader, CardContent, CardFooter, CardActions } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Obsah karty</Card>);
    expect(screen.getByText("Obsah karty")).toBeInTheDocument();
  });

  it("renders the header slot", () => {
    render(<Card header="Nadpis">Obsah</Card>);
    expect(screen.getByText("Nadpis")).toBeInTheDocument();
  });

  it("renders the footer slot", () => {
    render(<Card footer="Zápatí">Obsah</Card>);
    expect(screen.getByText("Zápatí")).toBeInTheDocument();
  });

  it("forwards a ref", () => {
    let node: HTMLDivElement | null = null;
    render(<Card ref={(el) => { node = el; }}>x</Card>);
    expect(node).toBeInstanceOf(HTMLDivElement);
  });

  it("CardHeader renders its children", () => {
    render(<Card><CardHeader>Titulek</CardHeader></Card>);
    expect(screen.getByText("Titulek")).toBeInTheDocument();
  });

  it("CardContent renders its children", () => {
    render(<Card><CardContent>obsah</CardContent></Card>);
    expect(screen.getByText("obsah")).toBeInTheDocument();
  });

  it("CardFooter renders its children", () => {
    render(<Card><CardFooter>zápatí</CardFooter></Card>);
    expect(screen.getByText("zápatí")).toBeInTheDocument();
  });

  it("CardActions renders its children via CardFooter", () => {
    render(<Card><CardActions><button>OK</button></CardActions></Card>);
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });
});
