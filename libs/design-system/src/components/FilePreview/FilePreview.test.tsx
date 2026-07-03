import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { FilePreview, FilePreviewTestId, iconForFile } from "./FilePreview";

describe("FilePreview", () => {
  it("shows name and formatted size", () => {
    render(<FilePreview name="spec.pdf" size={1_258_291} />);
    expect(screen.getByTestId(FilePreviewTestId.Name)).toHaveTextContent("spec.pdf");
    expect(screen.getByTestId(FilePreviewTestId.Size)).toHaveTextContent("1.2 MB");
  });

  it("fires onRemove", async () => {
    const onRemove = vi.fn();
    render(<FilePreview name="a.txt" onRemove={onRemove} size={10} />);
    await userEvent.click(screen.getByTestId(FilePreviewTestId.Remove));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("maps extensions to icons", () => {
    expect(iconForFile("main.ts")).toBe("code");
    expect(iconForFile("clip.mp4")).toBe("film");
    expect(iconForFile("notes.md")).toBe("doc");
    expect(iconForFile("data.bin")).toBe("file");
  });
});
