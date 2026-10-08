import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { ActivityDock, ActivityDockTestId } from "./ActivityDock";
import type { ActivityDockItem } from "./ActivityDock";

const items: ActivityDockItem[] = [
  { id: "pinned", icon: "pin", label: "Pinned", body: <p>Pinned body</p> },
  { id: "needs", icon: "bell", label: "Needs you", badge: 3, body: <p>Needs body</p> },
  { id: "tasks", icon: "check", label: "Tasks", badge: 0, body: <p>Tasks body</p> },
];

const buttons = () => screen.getAllByTestId(ActivityDockTestId.Button);

describe("ActivityDock", () => {
  it("renders collapsed with no body", () => {
    render(<ActivityDock activeId={null} items={items} onActiveChange={() => {}} />);
    expect(buttons()).toHaveLength(3);
    expect(screen.queryByTestId(ActivityDockTestId.Body)).toBeNull();
    expect(screen.queryByTestId(ActivityDockTestId.Backdrop)).toBeNull();
    buttons().forEach((b) => expect(b).toHaveAttribute("aria-pressed", "false"));
  });

  it("opens, switches and collapses via onActiveChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ActivityDock activeId={null} items={items} onActiveChange={onChange} />,
    );
    await user.click(buttons()[0]!);
    expect(onChange).toHaveBeenLastCalledWith("pinned");

    rerender(<ActivityDock activeId="pinned" items={items} onActiveChange={onChange} />);
    expect(screen.getByTestId(ActivityDockTestId.Body)).toHaveTextContent("Pinned body");
    expect(buttons()[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons()[0]).toHaveAttribute(
      "aria-controls",
      screen.getByTestId(ActivityDockTestId.Body).id,
    );
    await user.click(buttons()[1]!);
    expect(onChange).toHaveBeenLastCalledWith("needs");
    await user.click(buttons()[0]!);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("shows the badge only when > 0 and includes it in the accessible name", () => {
    render(<ActivityDock activeId={null} items={items} onActiveChange={() => {}} />);
    expect(screen.getAllByTestId(ActivityDockTestId.Badge)).toHaveLength(1);
    expect(buttons()[0]).toHaveAccessibleName("Pinned");
    expect(buttons()[1]).toHaveAccessibleName("Needs you, 3");
    expect(buttons()[2]).toHaveAccessibleName("Tasks");
  });

  it("caps the badge at 99+", () => {
    render(
      <ActivityDock
        activeId={null}
        items={[{ id: "a", icon: "bell", label: "A", badge: 150, body: null }]}
        onActiveChange={() => {}}
      />,
    );
    expect(screen.getByTestId(ActivityDockTestId.Badge)).toHaveTextContent("99+");
  });

  it("collapses on Escape in the body and restores focus to the icon", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ActivityDock
        activeId="pinned"
        items={[{ ...items[0]!, body: <button type="button">inner</button> }, items[1]!]}
        onActiveChange={onChange}
      />,
    );
    screen.getByText("inner").focus();
    await user.keyboard("{Escape}");
    expect(onChange).toHaveBeenCalledWith(null);
    expect(buttons()[0]).toHaveFocus();
  });

  it("closes on backdrop click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ActivityDock activeId="needs" items={items} onActiveChange={onChange} />);
    await user.click(screen.getByTestId(ActivityDockTestId.Backdrop));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
