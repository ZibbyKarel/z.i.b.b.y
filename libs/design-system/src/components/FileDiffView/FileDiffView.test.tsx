import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

    describe("resizable rail", () => {
      // jsdom has no PointerEvent, so clientX would be dropped; MouseEvent carries it.
      beforeAll(() => {
        if (!("PointerEvent" in window)) {
          Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true });
        }
      });

      const setup = () => {
        render(<FileDiffView fileList diff={TWO_FILES} />);
        const grid = screen.getByTestId(FileDiffViewTestId.FileList).parentElement as HTMLElement;
        const resizer = screen.getByTestId(FileDiffViewTestId.FileListResizer);
        return { grid, resizer };
      };

      it("defaults the file list to 25% width", () => {
        const { grid, resizer } = setup();
        expect(grid.style.gridTemplateColumns).toContain("25%");
        expect(resizer).toHaveRole("separator");
        expect(resizer).toHaveAttribute("aria-orientation", "vertical");
        expect(resizer).toHaveAttribute("aria-valuenow", "25");
        expect(resizer).toHaveAttribute("aria-valuemin", "15");
        expect(resizer).toHaveAttribute("aria-valuemax", "60");
        expect(resizer).toHaveAccessibleName("Resize file list");
      });

      it("arrow keys resize and clamp", () => {
        const { resizer } = setup();
        expect(fireEvent.keyDown(resizer, { key: "ArrowRight" })).toBe(false);
        expect(resizer).toHaveAttribute("aria-valuenow", "27");
        for (let i = 0; i < 30; i++) fireEvent.keyDown(resizer, { key: "ArrowRight" });
        expect(resizer).toHaveAttribute("aria-valuenow", "60");
        for (let i = 0; i < 40; i++) fireEvent.keyDown(resizer, { key: "ArrowLeft" });
        expect(resizer).toHaveAttribute("aria-valuenow", "15");
      });

      it("drag resizes relative to the container", () => {
        const { grid, resizer } = setup();
        grid.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
        fireEvent.pointerDown(resizer, { clientX: 250 });
        fireEvent.pointerMove(resizer, { clientX: 400 });
        expect(resizer).toHaveAttribute("aria-valuenow", "40");
        fireEvent.pointerMove(resizer, { clientX: 900 });
        expect(resizer).toHaveAttribute("aria-valuenow", "60");
        fireEvent.pointerUp(resizer);
        fireEvent.pointerMove(resizer, { clientX: 200 });
        expect(resizer).toHaveAttribute("aria-valuenow", "60");
      });

      it("keeps the width across collapse", () => {
        const { resizer } = setup();
        fireEvent.keyDown(resizer, { key: "ArrowRight" });
        fireEvent.click(screen.getByTestId(FileDiffViewTestId.FileListToggle));
        expect(screen.queryByTestId(FileDiffViewTestId.FileListResizer)).toBeNull();
        fireEvent.click(screen.getByTestId(FileDiffViewTestId.FileListToggle));
        expect(screen.getByTestId(FileDiffViewTestId.FileListResizer)).toHaveAttribute(
          "aria-valuenow",
          "27",
        );
      });
    });
  });
});
