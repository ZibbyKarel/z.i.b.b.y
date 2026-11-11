import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ReviewFindings, ReviewFindingsTestId } from "./ReviewFindings";

describe("ReviewFindings", () => {
  it("renders the summary and a card per finding with its severity", () => {
    renderWithProviders(
      <ReviewFindings
        approvalId="a1"
        findings={[
          { path: "a.ts", line: 4, severity: "Important", body: "Fix **this**." },
          { path: "b.ts", line: 9, startLine: 7, body: "No severity." },
        ]}
        summary="Overall fine."
      />,
    );
    expect(screen.getByTestId(ReviewFindingsTestId.Summary)).toHaveTextContent("Overall fine.");
    const files = screen.getAllByTestId(ReviewFindingsTestId.File);
    expect(files[0]).toHaveTextContent("a.ts:4");
    expect(files[1]).toHaveTextContent("b.ts:7-9");
    expect(screen.getAllByTestId(ReviewFindingsTestId.Severity)).toHaveLength(1);
    expect(screen.getAllByTestId(ReviewFindingsTestId.Finding)).toHaveLength(2);
  });

  it("shows the code context from the diff when the line is in it", () => {
    const diff = "diff --git a/a.ts b/a.ts\n@@ -1,2 +1,2 @@\n ctx\n+changed";
    renderWithProviders(
      <ReviewFindings
        approvalId="a1"
        diff={diff}
        findings={[
          { path: "a.ts", line: 2, body: "x" },
          { path: "a.ts", line: 50, body: "y" },
        ]}
        summary=""
      />,
    );
    const snippets = screen.getAllByTestId(ReviewFindingsTestId.Snippet);
    expect(snippets).toHaveLength(1);
    expect(snippets[0]).toHaveTextContent("changed");
  });

  it("puts each comment in an editable input and reports edits by index", () => {
    const onEdit = vi.fn();
    renderWithProviders(
      <ReviewFindings
        approvalId="a1"
        edits={{ 1: "changed" }}
        findings={[
          { path: "a.ts", line: 1, body: "first" },
          { path: "b.ts", line: 2, body: "second" },
        ]}
        onEdit={onEdit}
        summary=""
      />,
    );
    const inputs = screen.getAllByTestId(ReviewFindingsTestId.Comment);
    expect(inputs[0]).toHaveValue("first");
    expect(inputs[1]).toHaveValue("changed");
    fireEvent.change(inputs[0] as HTMLElement, { target: { value: "edited" } });
    expect(onEdit).toHaveBeenCalledWith(0, "edited");
  });

  it("links the file to that line in the PR", async () => {
    renderWithProviders(
      <ReviewFindings
        approvalId="a1"
        findings={[{ path: "a", line: 7, body: "x" }]}
        prUrl="https://github.com/o/r/pull/1"
        summary=""
      />,
    );
    const link = await screen.findByTestId(ReviewFindingsTestId.FileLink);
    expect(link).toHaveAttribute(
      "href",
      expect.stringMatching(/\/pull\/1\/files#diff-[0-9a-f]{64}R7$/),
    );
  });

  it("todo-1: removes a finding — reports its index and hides removed ones", () => {
    const onRemove = vi.fn();
    renderWithProviders(
      <ReviewFindings
        approvalId="a1"
        findings={[
          { path: "a.ts", line: 1, body: "first" },
          { path: "b.ts", line: 2, body: "second" },
          { path: "c.ts", line: 3, body: "third" },
        ]}
        onRemove={onRemove}
        removed={[0]}
        summary=""
      />,
    );
    const inputs = screen.getAllByTestId(ReviewFindingsTestId.Comment);
    expect(inputs.map((i) => (i as HTMLTextAreaElement).value)).toEqual(["second", "third"]);
    const buttons = screen.getAllByTestId(ReviewFindingsTestId.Remove);
    expect(buttons[1]).toHaveAccessibleName("Odebrat komentář");
    fireEvent.click(buttons[1] as HTMLElement);
    expect(onRemove).toHaveBeenCalledWith(2);
  });
});
