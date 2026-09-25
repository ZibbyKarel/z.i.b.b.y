import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffView, DiffViewTestId } from "./DiffView";
import type { DiffHunk } from "./DiffView";

const UNIFIED = [
  "--- a/file.ts",
  "+++ b/file.ts",
  "@@ -1,3 +1,3 @@",
  " const x = 1;",
  "-const y = 2;",
  "+const y = 3;",
].join("\n");

describe("DiffView", () => {
  it("parses a unified diff string into typed lines", () => {
    render(<DiffView unified={UNIFIED} />);
    const lines = screen.getAllByTestId(DiffViewTestId.Line);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toHaveTextContent("@@ -1,3 +1,3 @@");
    expect(lines[2]).toHaveTextContent("-const y = 2;");
    expect(lines[3]).toHaveTextContent("+const y = 3;");
  });

  it("drops the +++/--- file marker lines from a unified diff", () => {
    render(<DiffView unified={UNIFIED} />);
    for (const line of screen.getAllByTestId(DiffViewTestId.Line)) {
      expect(line.textContent).not.toMatch(/^(---|\+\+\+)/);
    }
  });

  it("renders explicit hunks when given, taking precedence over unified", () => {
    const hunks: DiffHunk[] = [{ header: "@@ -1 +1 @@", lines: [{ type: "add", text: "+hello" }] }];
    render(<DiffView hunks={hunks} unified={UNIFIED} />);
    const lines = screen.getAllByTestId(DiffViewTestId.Line);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toHaveTextContent("+hello");
  });

  it("renders the stat summary when given", () => {
    render(<DiffView stat={{ files: 2, additions: 5, deletions: 3 }} unified={UNIFIED} />);
    expect(screen.getByTestId(DiffViewTestId.Stat)).toHaveTextContent("2 files");
    expect(screen.getByTestId(DiffViewTestId.Stat)).toHaveTextContent("+5");
    expect(screen.getByTestId(DiffViewTestId.Stat)).toHaveTextContent("-3");
  });

  it("omits the stat summary when not given", () => {
    render(<DiffView unified={UNIFIED} />);
    expect(screen.queryByTestId(DiffViewTestId.Stat)).not.toBeInTheDocument();
  });
});
