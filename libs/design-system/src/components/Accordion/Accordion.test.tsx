import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Accordion } from "./Accordion";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Accordion", () => {
  it("hides content by default", () => {
    wrap(
      <Accordion
        sections={[{ title: "Kapitola 1", content: "Obsah kapitoly" }]}
      />,
    );
    expect(screen.getByText("Kapitola 1")).toBeInTheDocument();
    expect(screen.queryByText("Obsah kapitoly")).toBeNull();
  });

  it("expands on click", async () => {
    wrap(
      <Accordion
        sections={[{ title: "Kapitola 1", content: "Obsah kapitoly" }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Kapitola 1/ }));
    expect(screen.getByText("Obsah kapitoly")).toBeInTheDocument();
  });

  it("collapses on second click", async () => {
    wrap(
      <Accordion
        sections={[{ title: "Kapitola 1", content: "Obsah kapitoly" }]}
      />,
    );
    const btn = screen.getByRole("button", { name: /Kapitola 1/ });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.queryByText("Obsah kapitoly")).toBeNull();
  });

  it("renders expanded when defaultExpanded=true", () => {
    wrap(
      <Accordion
        sections={[
          { title: "Info", content: "Viditelný obsah", defaultExpanded: true },
        ]}
      />,
    );
    expect(screen.getByText("Viditelný obsah")).toBeInTheDocument();
  });

  it("sets aria-expanded correctly", () => {
    wrap(<Accordion sections={[{ title: "Test", content: "Obsah" }]} />);
    expect(screen.getByRole("button", { name: /Test/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("multi mode allows multiple sections open simultaneously", async () => {
    wrap(
      <Accordion
        sections={[
          { title: "Sekce A", content: "Obsah A" },
          { title: "Sekce B", content: "Obsah B" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Sekce A/ }));
    await userEvent.click(screen.getByRole("button", { name: /Sekce B/ }));
    expect(screen.getByText("Obsah A")).toBeInTheDocument();
    expect(screen.getByText("Obsah B")).toBeInTheDocument();
  });

  it("single mode closes the open section when another opens", async () => {
    wrap(
      <Accordion
        single
        sections={[
          { title: "Sekce A", content: "Obsah A" },
          { title: "Sekce B", content: "Obsah B" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Sekce A/ }));
    expect(screen.getByText("Obsah A")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Sekce B/ }));
    expect(screen.queryByText("Obsah A")).toBeNull();
    expect(screen.getByText("Obsah B")).toBeInTheDocument();
  });

  it("single mode can close the active section by clicking it again", async () => {
    wrap(
      <Accordion
        single
        sections={[{ title: "Sekce A", content: "Obsah A" }]}
      />,
    );
    const btn = screen.getByRole("button", { name: /Sekce A/ });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(screen.queryByText("Obsah A")).toBeNull();
  });
});
