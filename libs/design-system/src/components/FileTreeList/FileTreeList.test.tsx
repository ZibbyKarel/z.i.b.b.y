import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileTreeList, FileTreeListTestId } from "./FileTreeList";

const ENTRIES = [
  { path: "output", kind: "dir" as const },
  { path: "output/report.md", kind: "file" as const, size: "3.2 KB", when: "2m" },
];

describe("FileTreeList", () => {
  it("indents 18px per depth and shows the leaf name", () => {
    render(<FileTreeList entries={ENTRIES} />);
    const row = screen.getByTestId(`${FileTreeListTestId.Row}-output/report.md`);
    const name = within(row).getByTestId(FileTreeListTestId.Name);
    expect(name).toHaveTextContent("report.md");
    expect(name).toHaveStyle({ paddingLeft: "18px" });
  });

  it("marks directories with a caret and a trailing slash", () => {
    render(<FileTreeList entries={ENTRIES} />);
    const name = within(screen.getByTestId(`${FileTreeListTestId.Row}-output`)).getByTestId(
      FileTreeListTestId.Name,
    );
    expect(name.textContent?.startsWith("▸")).toBe(true);
    expect(name).toHaveTextContent("output/");
    expect(name).toHaveStyle({ paddingLeft: "0px" });
  });

  it("renders size and time and forwards ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(<FileTreeList entries={ENTRIES} ref={ref} />);
    const row = screen.getByTestId(`${FileTreeListTestId.Row}-output/report.md`);
    expect(row).toHaveTextContent("3.2 KB");
    expect(row).toHaveTextContent("2m");
    expect(ref.current).toBe(screen.getByTestId(FileTreeListTestId.Root));
  });
});
