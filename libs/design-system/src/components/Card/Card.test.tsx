import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Card, CardHeader, CardContent, CardFooter, CardActions } from "./Card";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Card", () => {
  it("renders children", () => {
    wrap(<Card>Obsah karty</Card>);
    expect(screen.getByText("Obsah karty")).toBeInTheDocument();
  });

  it("renders the header slot", () => {
    wrap(<Card header="Nadpis">Obsah</Card>);
    expect(screen.getByText("Nadpis")).toBeInTheDocument();
  });

  it("renders the footer slot", () => {
    wrap(<Card footer="Zápatí">Obsah</Card>);
    expect(screen.getByText("Zápatí")).toBeInTheDocument();
  });

  it("forwards a ref", () => {
    let node: HTMLDivElement | null = null;
    wrap(<Card ref={(el) => { node = el; }}>x</Card>);
    expect(node).toBeInstanceOf(HTMLDivElement);
  });

  it("CardHeader renders its children", () => {
    wrap(<Card><CardHeader>Titulek</CardHeader></Card>);
    expect(screen.getByText("Titulek")).toBeInTheDocument();
  });

  it("CardContent renders its children", () => {
    wrap(<Card><CardContent>obsah</CardContent></Card>);
    expect(screen.getByText("obsah")).toBeInTheDocument();
  });

  it("CardFooter renders its children", () => {
    wrap(<Card><CardFooter>zápatí</CardFooter></Card>);
    expect(screen.getByText("zápatí")).toBeInTheDocument();
  });

  it("CardActions renders its children via CardFooter", () => {
    wrap(<Card><CardActions><button>OK</button></CardActions></Card>);
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });
});
