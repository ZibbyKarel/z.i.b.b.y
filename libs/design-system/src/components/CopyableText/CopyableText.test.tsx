import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyableText, CopyableTextTestId } from "./CopyableText";

describe("CopyableText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the text and a labelled copy button", () => {
    render(<CopyableText text="run_42" />);
    expect(screen.getByTestId(CopyableTextTestId.Text)).toHaveTextContent("run_42");
    expect(screen.getByTestId(CopyableTextTestId.Copy)).toHaveAccessibleName("Copy");
  });

  it("uses a custom copy label", () => {
    render(<CopyableText copyLabel="Kopírovat ID" text="run_42" />);
    expect(screen.getByTestId(CopyableTextTestId.Copy)).toHaveAccessibleName("Kopírovat ID");
  });

  it("copies the text to the clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<CopyableText text="run_42" />);
    await userEvent.click(screen.getByTestId(CopyableTextTestId.Copy));
    expect(writeText).toHaveBeenCalledWith("run_42");
  });
});
