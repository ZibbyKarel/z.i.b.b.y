import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProgressTestId } from "../Progress/Progress";
import { render } from "../../utils/testRender";
import { RowGroupHeader, RowGroupHeaderTestId } from "./RowGroupHeader";

describe("RowGroupHeader", () => {
  it("shows caret, key, title, count and toggles", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <RowGroupHeader
        closed={false}
        count="02/05"
        groupKey="EP-1"
        label="Epic"
        onToggle={onToggle}
        progress={40}
        title="Checkout"
      />,
    );
    const root = screen.getByTestId(RowGroupHeaderTestId.Root);
    expect(root).toHaveAttribute("aria-expanded", "true");
    expect(root).toHaveAccessibleName("Epic");
    expect(screen.getByTestId(RowGroupHeaderTestId.Caret)).toHaveTextContent("▾");
    expect(screen.getByTestId(RowGroupHeaderTestId.Key)).toHaveTextContent("EP-1");
    expect(screen.getByTestId(RowGroupHeaderTestId.Title)).toHaveTextContent("Checkout");
    expect(screen.getByTestId(RowGroupHeaderTestId.Count)).toHaveTextContent("02/05");
    expect(screen.getByTestId(ProgressTestId.Fill)).toHaveStyle({ width: "40%" });
    await userEvent.click(root);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <RowGroupHeader closed count="" groupKey="" onToggle={onToggle} progress={0} title="" />,
    );
    expect(screen.getByTestId(RowGroupHeaderTestId.Caret)).toHaveTextContent("▸");
  });
});
