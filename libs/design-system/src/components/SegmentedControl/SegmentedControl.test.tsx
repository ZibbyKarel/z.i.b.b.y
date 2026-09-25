import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl, SegmentedControlTestId } from "./SegmentedControl";
import type { SegmentedControlItem } from "./SegmentedControl";

const ITEMS: SegmentedControlItem[] = [
  { value: "auto", label: "Auto", dot: "working" },
  { value: "ask", label: "Ask" },
  { value: "silent", label: "Silent" },
];

describe("SegmentedControl", () => {
  it("renders a radiogroup with one radio per item", () => {
    render(
      <SegmentedControl ariaLabel="Gate mode" items={ITEMS} onChange={() => {}} value="auto" />,
    );
    expect(screen.getByTestId(SegmentedControlTestId.Root)).toHaveRole("radiogroup");
    expect(screen.getByTestId(SegmentedControlTestId.Root)).toHaveAccessibleName("Gate mode");
    expect(screen.getByTestId(`${SegmentedControlTestId.Item}-auto`)).toHaveRole("radio");
  });

  it("marks the active item as checked and focusable", () => {
    render(
      <SegmentedControl ariaLabel="Gate mode" items={ITEMS} onChange={() => {}} value="ask" />,
    );
    expect(screen.getByTestId(`${SegmentedControlTestId.Item}-ask`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId(`${SegmentedControlTestId.Item}-ask`)).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByTestId(`${SegmentedControlTestId.Item}-auto`)).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("calls onChange on click", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl ariaLabel="Gate mode" items={ITEMS} onChange={onChange} value="auto" />,
    );
    await userEvent.click(screen.getByTestId(`${SegmentedControlTestId.Item}-ask`));
    expect(onChange).toHaveBeenCalledWith("ask");
  });

  it("moves selection with ArrowRight/ArrowLeft, wrapping at the ends", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl ariaLabel="Gate mode" items={ITEMS} onChange={onChange} value="silent" />,
    );
    screen.getByTestId(`${SegmentedControlTestId.Item}-silent`).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("auto");
  });

  it("jumps to the first/last item on Home/End", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl ariaLabel="Gate mode" items={ITEMS} onChange={onChange} value="ask" />,
    );
    screen.getByTestId(`${SegmentedControlTestId.Item}-ask`).focus();
    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith("silent");
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith("auto");
  });

  it("renders a leading dot only for items that specify one", () => {
    render(
      <SegmentedControl ariaLabel="Gate mode" items={ITEMS} onChange={() => {}} value="auto" />,
    );
    expect(screen.getAllByTestId(SegmentedControlTestId.Dot)).toHaveLength(1);
  });
});
