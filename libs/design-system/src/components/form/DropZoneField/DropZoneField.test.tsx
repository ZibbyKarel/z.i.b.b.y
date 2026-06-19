import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropZoneTestId } from "../../DropZone/DropZone";
import { FieldTestId } from "../Field";
import { DropZoneField } from "./DropZoneField";

describe("DropZoneField", () => {
  it("renders the label", () => {
    render(<DropZoneField label="Přílohy" onDrop={vi.fn()} />);
    expect(screen.getByTestId(FieldTestId.Label)).toHaveTextContent("Přílohy");
  });

  it("wires the label to the dropzone via aria-labelledby", () => {
    render(<DropZoneField label="Přílohy" onDrop={vi.fn()} />);
    const labelId = screen.getByTestId(FieldTestId.Label).id;
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveAttribute("aria-labelledby", labelId);
  });

  it("shows a hint", () => {
    render(<DropZoneField hint="Max 10 MB" label="Přílohy" onDrop={vi.fn()} />);
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("Max 10 MB");
  });

  it("shows an error and passes invalid to DropZone", () => {
    render(<DropZoneField error="Povinné pole" label="Přílohy" onDrop={vi.fn()} />);
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Povinné pole");
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveClass("border-bad");
  });

  it("wires aria-describedby to the error/hint message", () => {
    render(<DropZoneField error="Chyba" label="Přílohy" onDrop={vi.fn()} />);
    const messageId = screen.getByTestId(FieldTestId.Error).id;
    expect(screen.getByTestId(DropZoneTestId.Root)).toHaveAttribute("aria-describedby", messageId);
  });
});
