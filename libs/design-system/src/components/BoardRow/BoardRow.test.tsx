import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import {
  BoardColumnHeader,
  BoardGrid,
  BoardLead,
  BoardLine,
  BoardRow,
  BoardRowTestId,
} from "./BoardRow";

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

  it("an alert row gets the error background instead of the panel fill", () => {
    const { rerender } = render(<BoardRow tone="error">x</BoardRow>);
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveClass("bg-panel");
    rerender(
      <BoardRow alert bar={false} tone="error">
        x
      </BoardRow>,
    );
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).toHaveClass("bg-bad/15");
    expect(row).not.toHaveClass("bg-panel");
    expect(row).toHaveAttribute("data-alert", "true");
  });

  it("draws a muted row at half opacity", () => {
    const { rerender } = render(<BoardRow tone="idle">x</BoardRow>);
    expect(screen.getByTestId(BoardRowTestId.Root)).not.toHaveClass("opacity-50");
    rerender(
      <BoardRow muted tone="idle">
        x
      </BoardRow>,
    );
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveClass("opacity-50");
  });

  it("draws the left status bar unless bar is false", () => {
    const { rerender } = render(<BoardRow tone="blocked">x</BoardRow>);
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveClass(
      "border-l-[color:var(--color-state-block)]",
    );
    rerender(
      <BoardRow bar={false} tone="blocked">
        x
      </BoardRow>,
    );
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).not.toHaveClass("border-l-[color:var(--color-state-block)]");
    expect(row).not.toHaveClass("border-l-[length:var(--bridge-bar)]");
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
      <BoardRow selected onClick={() => {}} tone="blocked">
        x
      </BoardRow>,
    );
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveClass("z-[31]");
  });

  it("renders a static, non-focusable div without onClick", () => {
    render(
      <BoardRow rowKey="runs:r2" tone="idle">
        x
      </BoardRow>,
    );
    const row = screen.getByTestId(BoardRowTestId.Root);
    expect(row.tagName).toBe("DIV");
    expect(row).not.toHaveAttribute("aria-pressed");
    expect(row).not.toHaveClass("cursor-pointer");
  });

  it("adds the ink right border on a selected row when the sheet opens left", () => {
    render(
      <BoardRow selected onClick={() => {}} sheetSide="left" tone="idle">
        x
      </BoardRow>,
    );
    expect(screen.getByTestId(BoardRowTestId.Root).className).toContain(
      "inset_-1px_0_0_var(--color-ink)",
    );
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
      "grid-cols-[16px_minmax(0,1fr)_auto]",
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

  it("renders a top-aligned lead beside stacked lines", () => {
    render(
      <BoardLead lead={<i>av</i>}>
        <b>one</b>
        <b>two</b>
      </BoardLead>,
    );
    const lead = screen.getByTestId(BoardRowTestId.Lead);
    expect(lead).toHaveClass("items-start");
    expect(lead).toHaveTextContent("avonetwo");
  });

  it('indent="icon" aligns under the text past a 16px icon', () => {
    render(
      <BoardLine gap="6" indent="icon">
        chip
      </BoardLine>,
    );
    expect(screen.getByTestId(BoardRowTestId.Line)).toHaveClass("pl-[24px]");
  });

  it("renders an action beside the row button, never inside it", async () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <BoardRow
        needsYou
        action={
          <button onClick={onAction} type="button">
            Play
          </button>
        }
        onClick={onClick}
        rowKey="todo:p1/a"
        tone="idle"
      >
        row
      </BoardRow>,
    );
    const frame = screen.getByTestId(BoardRowTestId.Frame);
    const row = screen.getByTestId(BoardRowTestId.Root);
    const action = screen.getByTestId(BoardRowTestId.Action);

    expect(row).toHaveRole("button");
    expect(row).toHaveAttribute("data-rk", "todo:p1/a");
    expect(row).toHaveClass("min-w-0", "flex-1");
    expect(action).toHaveTextContent("Play");
    expect(row.contains(action)).toBe(false);
    expect(frame.contains(row) && frame.contains(action)).toBe(true);
    // The visual chrome (bar + rings) lives on the frame, not the shrinking body.
    expect(frame).toHaveClass("border-l-[color:var(--color-state-idle)]");
    expect(frame).toHaveClass("shadow-[inset_0_0_0_1px_var(--color-ink)]");
    expect(row).not.toHaveClass("bg-panel");

    await userEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
    await userEvent.click(action.firstElementChild as HTMLElement);
    expect(onAction).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders no frame without an action", () => {
    render(<BoardRow tone="idle">x</BoardRow>);
    expect(screen.queryByTestId(BoardRowTestId.Frame)).toBeNull();
    expect(screen.queryByTestId(BoardRowTestId.Action)).toBeNull();
    expect(screen.getByTestId(BoardRowTestId.Root)).toHaveClass("bg-panel");
  });

  it("trailing renders inside the row body", () => {
    render(
      <BoardRow tone="idle" trailing={<span>T</span>}>
        <span>child</span>
      </BoardRow>,
    );
    const root = screen.getByTestId(BoardRowTestId.Root);
    const trailing = screen.getByTestId(BoardRowTestId.Trailing);
    expect(root).toContainElement(trailing);
    expect(trailing).toHaveTextContent("T");
    expect(screen.getByTestId(BoardRowTestId.Content)).toHaveTextContent("child");
  });

  it("no trailing keeps children directly in Root", () => {
    render(
      <BoardRow tone="idle">
        <span>child</span>
      </BoardRow>,
    );
    expect(screen.queryByTestId(BoardRowTestId.Trailing)).toBeNull();
    expect(screen.queryByTestId(BoardRowTestId.Content)).toBeNull();
  });
});
