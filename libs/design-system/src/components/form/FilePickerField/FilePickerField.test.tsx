import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldTestId } from "../Field";
import { FilePickerField, FilePickerFieldTestId } from "./FilePickerField";

describe("FilePickerField", () => {
  it("associates the label with the input", () => {
    render(<FilePickerField label="Nahrát soubor" />);
    expect(screen.getByTestId(FilePickerFieldTestId.Input)).toHaveAccessibleName(
      "Nahrát soubor",
    );
  });

  it("renders the placeholder when no file is selected", () => {
    render(<FilePickerField label="Soubor" placeholder="Žádný soubor" />);
    expect(screen.getByTestId(FilePickerFieldTestId.Display)).toHaveTextContent(
      "Žádný soubor",
    );
  });

  it("shows the filename after a file is selected", () => {
    render(<FilePickerField label="Soubor" />);
    const input = screen.getByTestId(FilePickerFieldTestId.Input);

    Object.defineProperty(input, "files", {
      value: [new File([""], "report.pdf", { type: "application/pdf" })],
      configurable: true,
    });
    fireEvent.change(input);

    expect(screen.getByTestId(FilePickerFieldTestId.Display)).toHaveTextContent(
      "report.pdf",
    );
  });

  it("shows a count when multiple files are selected", () => {
    render(<FilePickerField multiple label="Soubory" />);
    const input = screen.getByTestId(FilePickerFieldTestId.Input);

    Object.defineProperty(input, "files", {
      value: [
        new File([""], "a.txt"),
        new File([""], "b.txt"),
        new File([""], "c.txt"),
      ],
      configurable: true,
    });
    fireEvent.change(input);

    expect(screen.getByTestId(FilePickerFieldTestId.Display)).toHaveTextContent(
      "3 souborů vybráno",
    );
  });

  it("fires onChange when a file is selected", () => {
    const onChange = vi.fn();
    render(<FilePickerField label="Soubor" onChange={onChange} />);
    const input = screen.getByTestId(FilePickerFieldTestId.Input);

    Object.defineProperty(input, "files", {
      value: [new File([""], "test.txt")],
      configurable: true,
    });
    fireEvent.change(input);

    expect(onChange).toHaveBeenCalledOnce();
  });

  it("renders an error and marks the input invalid", () => {
    render(<FilePickerField error="Povinné pole" label="Soubor" />);
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Povinné pole");
    expect(screen.getByTestId(FilePickerFieldTestId.Input)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("the trigger button is type=button", () => {
    render(<FilePickerField label="Soubor" />);
    expect(screen.getByTestId(FilePickerFieldTestId.Trigger)).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("the trigger button is keyboard accessible", async () => {
    const user = userEvent.setup();
    render(<FilePickerField label="Soubor" />);
    await user.tab();
    expect(screen.getByTestId(FilePickerFieldTestId.Trigger)).toHaveFocus();
  });

  it("sets webkitdirectory attribute when directory prop is true", () => {
    render(<FilePickerField directory label="Složka" />);
    expect(screen.getByTestId(FilePickerFieldTestId.Input).getAttribute("webkitdirectory")).toBe(
      "",
    );
  });
});
