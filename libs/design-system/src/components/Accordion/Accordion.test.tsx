import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Accordion, AccordionItem } from "./Accordion";

describe("Accordion", () => {
  it("hides content by default", () => {
    render(
      <Accordion>
        <AccordionItem summary="Kapitola 1">Obsah kapitoly</AccordionItem>
      </Accordion>,
    );
    expect(screen.getByText("Kapitola 1")).toBeInTheDocument();
    expect(screen.queryByText("Obsah kapitoly")).toBeNull();
  });

  it("expands on click", async () => {
    render(
      <Accordion>
        <AccordionItem summary="Kapitola 1">Obsah kapitoly</AccordionItem>
      </Accordion>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Kapitola 1/ }));
    expect(screen.getByText("Obsah kapitoly")).toBeInTheDocument();
  });

  it("collapses on second click", async () => {
    render(
      <Accordion>
        <AccordionItem summary="Kapitola 1">Obsah kapitoly</AccordionItem>
      </Accordion>,
    );
    const btn = screen.getByRole("button", { name: /Kapitola 1/ });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.queryByText("Obsah kapitoly")).toBeNull();
  });

  it("renders expanded when defaultExpanded=true", () => {
    render(
      <Accordion>
        <AccordionItem summary="Info" defaultExpanded>
          Viditelný obsah
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByText("Viditelný obsah")).toBeInTheDocument();
  });

  it("sets aria-expanded correctly", () => {
    render(
      <Accordion>
        <AccordionItem summary="Test">Obsah</AccordionItem>
      </Accordion>,
    );
    expect(screen.getByRole("button", { name: /Test/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("multiple items expand independently", async () => {
    render(
      <Accordion>
        <AccordionItem summary="Sekce A">Obsah A</AccordionItem>
        <AccordionItem summary="Sekce B">Obsah B</AccordionItem>
      </Accordion>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Sekce A/ }));
    await userEvent.click(screen.getByRole("button", { name: /Sekce B/ }));
    expect(screen.getByText("Obsah A")).toBeInTheDocument();
    expect(screen.getByText("Obsah B")).toBeInTheDocument();
  });

  describe("single mode", () => {
    it("closes the open item when another opens", async () => {
      render(
        <Accordion single>
          <AccordionItem summary="Sekce A">Obsah A</AccordionItem>
          <AccordionItem summary="Sekce B">Obsah B</AccordionItem>
        </Accordion>,
      );
      await userEvent.click(screen.getByRole("button", { name: /Sekce A/ }));
      expect(screen.getByText("Obsah A")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /Sekce B/ }));
      expect(screen.queryByText("Obsah A")).toBeNull();
      expect(screen.getByText("Obsah B")).toBeInTheDocument();
    });

    it("collapses the active item on second click", async () => {
      render(
        <Accordion single>
          <AccordionItem summary="Sekce A">Obsah A</AccordionItem>
        </Accordion>,
      );
      const btn = screen.getByRole("button", { name: /Sekce A/ });
      await userEvent.click(btn);
      await userEvent.click(btn);
      expect(screen.queryByText("Obsah A")).toBeNull();
    });
  });
});
