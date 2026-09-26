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

  it("wraps the row in a new-tab link when href is set", () => {
    render(<FilePreview href="/files/spec.pdf" name="spec.pdf" size={10} />);
    const link = screen.getByTestId(FilePreviewTestId.Link);
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/files/spec.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no link when href is absent", () => {
    render(<FilePreview name="spec.pdf" size={10} />);
    expect(screen.queryByTestId(FilePreviewTestId.Link)).not.toBeInTheDocument();
  });

  it("maps extensions to icons", () => {
    expect(iconForFile("main.ts")).toBe("code");
    expect(iconForFile("clip.mp4")).toBe("film");
    expect(iconForFile("notes.md")).toBe("doc");
    expect(iconForFile("data.bin")).toBe("file");
  });
});
