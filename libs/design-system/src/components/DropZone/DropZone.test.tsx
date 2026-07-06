import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropZone, DropZoneTestId } from "./DropZone";

describe("DropZone", () => {
  it("renders root, hidden input, and idle hint", () => {
    render(<DropZone onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(DropZoneTestId.Input)).toBeInTheDocument();
    expect(screen.getByTestId(DropZoneTestId.Hint)).toHaveTextContent(
      "Drop files here or click to select",
    );
  });

  it("renders a custom idle label", () => {
    render(<DropZone idleLabel="Přetáhněte soubory sem" onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Hint)).toHaveTextContent("Přetáhněte soubory sem");
  });

  it("is keyboard focusable", () => {
    render(<DropZone onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveAttribute("tabindex", "0");
  });

  it("forwards aria-labelledby to the root", () => {
    render(<DropZone aria-labelledby="my-label" onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveAttribute("aria-labelledby", "my-label");
  });

  it("forwards aria-describedby to the root", () => {
    render(<DropZone aria-describedby="my-desc" onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveAttribute("aria-describedby", "my-desc");
  });

  it("adds error border class when invalid", () => {
    render(<DropZone invalid onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveClass("border-bad");
  });

  it("reduces opacity when disabled", () => {
    render(<DropZone disabled onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveClass("opacity-50");
  });

  it("the hidden input has type=file", () => {
    render(<DropZone onDrop={vi.fn()} />);
    expect(screen.getByTestId(DropZoneTestId.Input)).toHaveAttribute("type", "file");
  });
});
