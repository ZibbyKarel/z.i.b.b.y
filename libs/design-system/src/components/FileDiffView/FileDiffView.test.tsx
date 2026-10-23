import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileDiffView, FileDiffViewTestId } from "./FileDiffView";

const TWO_FILES = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
diff --git a/img.png b/img.png
index 333..444 100644
Binary files a/img.png and b/img.png differ
`;

const RENAME = `diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
`;

describe("FileDiffView", () => {
  it("renders one section per file and a no-hunks note for binaries", () => {
    render(<FileDiffView diff={TWO_FILES} />);
    expect(screen.getAllByTestId(FileDiffViewTestId.File)).toHaveLength(2);
    expect(screen.getAllByTestId(FileDiffViewTestId.FileName).map((n) => n.textContent)).toEqual([
      "src/a.ts",
      "img.png",
    ]);
    expect(screen.getByTestId(FileDiffViewTestId.NoHunks)).toHaveTextContent(
      "No textual changes (binary file or rename).",
    );
  });

  it("shows the empty label for an empty diff", () => {
    render(<FileDiffView diff="" />);
    expect(screen.getByTestId(FileDiffViewTestId.Empty)).toHaveTextContent("No changes.");
  });

  it("shows old → new for a rename", () => {
    render(<FileDiffView diff={RENAME} />);
    expect(screen.getByTestId(FileDiffViewTestId.FileName)).toHaveTextContent("old.ts → new.ts");
  });

  it("uses custom labels", () => {
    render(<FileDiffView diff="" emptyLabel="Nic" />);
    expect(screen.getByTestId(FileDiffViewTestId.Empty)).toHaveTextContent("Nic");
  });

  describe("fileList", () => {
    it("renders no file list by default", () => {
      render(<FileDiffView diff={TWO_FILES} />);
      expect(screen.queryByTestId(FileDiffViewTestId.FileList)).toBeNull();
    });

    it("lists every file with +/− counts", () => {
      render(<FileDiffView fileList diff={TWO_FILES} />);
      const first = screen.getByTestId(`${FileDiffViewTestId.FileListItem}-0`);
      expect(first).toHaveTextContent("src/a.ts");
      expect(first).toHaveTextContent("+1");
      expect(first).toHaveTextContent("−1");
      expect(screen.getByTestId(`${FileDiffViewTestId.FileListItem}-1`)).toHaveTextContent(
        "img.png",
      );
    });

    it("clicking a file scrolls its diff section into view", () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<FileDiffView fileList diff={TWO_FILES} />);
      fireEvent.click(screen.getByTestId(`${FileDiffViewTestId.FileListItem}-1`));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(
        screen.getAllByTestId(FileDiffViewTestId.File)[1],
      );
    });

    it("collapses to a narrow strip and expands back", () => {
      render(<FileDiffView fileList diff={TWO_FILES} />);
      const toggle = screen.getByTestId(FileDiffViewTestId.FileListToggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(toggle);
      expect(screen.queryByTestId(FileDiffViewTestId.FileList)).toBeNull();
      expect(screen.getByTestId(FileDiffViewTestId.FileListStrip)).toBeInTheDocument();
      expect(screen.getByTestId(FileDiffViewTestId.FileListToggle)).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      fireEvent.click(screen.getByTestId(FileDiffViewTestId.FileListToggle));
      expect(screen.getByTestId(FileDiffViewTestId.FileList)).toBeInTheDocument();
    });
  });
});
