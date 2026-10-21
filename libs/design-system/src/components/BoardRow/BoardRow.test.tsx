import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { BoardColumnHeader, BoardGrid, BoardLine, BoardRow, BoardRowTestId } from "./BoardRow";

describe("BoardRow", () => {
  it("is a button carrying data-rk and firing onClick", async () => {
    const onClick = vi.fn();
    render(
      <BoardRow onClick={onClick} rowKey="issues:ZB-1" tone="working">
        row
      </BoardRow>,
    );
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).toHaveRole("button");
    expect(row).toHaveAttribute("data-rk", "issues:ZB-1");
    expect(row).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks selected and needsYou", () => {
    const { rerender } = render(
      <BoardRow needsYou tone="blocked">
        x
      </BoardRow>,
    );
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveClass(
      "shadow-[inset_0_0_0_1px_var(--color-ink)]",
    );
    rerender(
      <BoardRow selected tone="blocked">
        x
      </BoardRow>,
    );
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveClass("z-[31]");
  });

  it("uses the PR padding and a grid template when asked", () => {
    render(
      <BoardRow columns="task" padding="pr" tone="idle">
        x
      </BoardRow>,
    );
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).toHaveClass(
      "py-[var(--bridge-pr-py)]",
      "grid",
      "grid-cols-[66px_minmax(0,1fr)_auto_auto]",
    );
  });

  it("renders the inner grid and column header", () => {
    render(
      <>
        <BoardColumnHeader columns="run">head</BoardColumnHeader>
        <BoardGrid columns="issue">line</BoardGrid>
      </>,
    );
    expect(screen.getByTestId(BoardRowTestId.ColumnHeader)).toHaveTextContent("head");
    expect(screen.getByTestId(BoardRowTestId.Grid)).toHaveClass(
      "grid-cols-[84px_minmax(0,1fr)_auto]",
    );
  });

  it("renders a line with an end slot", () => {
    render(
      <BoardLine indent end={<i>age</i>} gap="6">
        chip
      </BoardLine>,
    );
    const line = screen.getByTestId(BoardRowTestId.Line);
    expect(line).toHaveClass("gap-[6px]", "pl-[92px]");
    expect(line).toHaveTextContent("chipage");
  });
});
