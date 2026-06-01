import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Accordion, AccordionTestId, AccordionItem } from "./Accordion";

describe("Accordion", () => {
  it("hides content by default", () => {
    render(
      <Accordion>
        <AccordionItem summary="Kapitola 1">Obsah kapitoly</AccordionItem>
      </Accordion>,
    );
    expect(screen.getByTestId(AccordionTestId.Summary)).toHaveTextContent("Kapitola 1");
    expect(screen.queryByTestId(AccordionTestId.Details)).toBeNull();
  });

  it("expands on click", async () => {
    render(
      <Accordion>
        <AccordionItem summary="Kapitola 1">Obsah kapitoly</AccordionItem>
      </Accordion>,
    );
    await userEvent.click(screen.getByTestId(AccordionTestId.Summary));
    expect(screen.getByTestId(AccordionTestId.Details)).toHaveTextContent("Obsah kapitoly");
  });

  it("collapses on second click", async () => {
    render(
      <Accordion>
        <AccordionItem summary="Kapitola 1">Obsah kapitoly</AccordionItem>
      </Accordion>,
    );
    const btn = screen.getByTestId(AccordionTestId.Summary);
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.queryByTestId(AccordionTestId.Details)).toBeNull();
  });

  it("renders expanded when defaultExpanded=true", () => {
    render(
      <Accordion>
        <AccordionItem summary="Info" defaultExpanded>
          Viditelný obsah
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByTestId(AccordionTestId.Details)).toHaveTextContent("Viditelný obsah");
  });

  it("sets aria-expanded correctly", () => {
    render(
      <Accordion>
        <AccordionItem summary="Test">Obsah</AccordionItem>
      </Accordion>,
    );
    expect(screen.getByTestId(AccordionTestId.Summary)).toHaveAttribute("aria-expanded", "false");
  });

  it("multiple items expand independently", async () => {
    render(
      <Accordion>
        <AccordionItem summary="Sekce A">Obsah A</AccordionItem>
        <AccordionItem summary="Sekce B">Obsah B</AccordionItem>
      </Accordion>,
    );
    const summaries = screen.getAllByTestId(AccordionTestId.Summary);
    await userEvent.click(summaries[0]!);
    await userEvent.click(summaries[1]!);
    const details = screen.getAllByTestId(AccordionTestId.Details);
    expect(details).toHaveLength(2);
    expect(details[0]).toHaveTextContent("Obsah A");
    expect(details[1]).toHaveTextContent("Obsah B");
  });

  describe("single mode", () => {
    it("closes the open item when another opens", async () => {
      render(
        <Accordion single>
          <AccordionItem summary="Sekce A">Obsah A</AccordionItem>
          <AccordionItem summary="Sekce B">Obsah B</AccordionItem>
        </Accordion>,
      );
      const summaries = screen.getAllByTestId(AccordionTestId.Summary);
      await userEvent.click(summaries[0]!);
      expect(screen.getByTestId(AccordionTestId.Details)).toHaveTextContent("Obsah A");
      await userEvent.click(summaries[1]!);
      const open = screen.getByTestId(AccordionTestId.Details);
      expect(open).toHaveTextContent("Obsah B");
      expect(open).not.toHaveTextContent("Obsah A");
    });

    it("collapses the active item on second click", async () => {
      render(
        <Accordion single>
          <AccordionItem summary="Sekce A">Obsah A</AccordionItem>
        </Accordion>,
      );
      const btn = screen.getByTestId(AccordionTestId.Summary);
      await userEvent.click(btn);
      await userEvent.click(btn);
      expect(screen.queryByTestId(AccordionTestId.Details)).toBeNull();
    });
  });
});
