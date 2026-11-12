import { UsagePanelTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderWithProviders, screen } from "../../../test/render";
import { HeaderLimits, HeaderLimitsTestId } from "./HeaderLimits";

vi.mock("../../../features/bridge/widgets/BudgetsWidget", () => ({
  BudgetsWidget: () => (
    <div data-testid="budgets-widget-stub">
      <a data-testid="widget-link-1" href="#a">
        a
      </a>
      <a data-testid="widget-link-2" href="#b">
        b
      </a>
    </div>
  ),
}));

const items = [
  { label: "5H", value: 40 },
  { label: "TÝDEN", value: 10 },
];

const setup = () => {
  renderWithProviders(<HeaderLimits items={items} />);
  return {
    root: screen.getByTestId(HeaderLimitsTestId.Root),
    trigger: screen.getByTestId(HeaderLimitsTestId.Trigger),
    popover: () => screen.queryByTestId(HeaderLimitsTestId.Popover),
  };
};

describe("HeaderLimits", () => {
  it("links the usage panel to the Budgets & limits page", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("href", "/governance/budgets");
    expect(trigger).toHaveAccessibleName("Budgety a limity");
    expect(screen.getByTestId(UsagePanelTestId.Root)).toBeInTheDocument();
  });

  it("shows the Budgets & limits widget on hover and hides it on leave", () => {
    const { root, popover } = setup();
    expect(popover()).not.toBeInTheDocument();
    fireEvent.mouseEnter(root);
    expect(popover()).toBeInTheDocument();
    expect(screen.getByTestId("budgets-widget-stub")).toBeInTheDocument();
    expect(screen.getByTestId(HeaderLimitsTestId.Title)).toHaveTextContent("Budgety a limity");
    fireEvent.mouseLeave(root);
    expect(popover()).not.toBeInTheDocument();
  });

  it("portals the popover to body so the header's overflow wrapper cannot clip it", () => {
    const { root, popover } = setup();
    fireEvent.mouseEnter(root);
    const el = popover();
    expect(el).toBeInTheDocument();
    expect(root).not.toContainElement(el);
    expect(el?.parentElement).toBe(document.body);
    expect(el).toHaveClass("fixed");
  });

  it("keeps the popover open when focus moves into it", () => {
    const { trigger, popover } = setup();
    fireEvent.focus(trigger);
    const el = popover();
    if (!el) throw new Error("popover missing");
    fireEvent.blur(trigger, { relatedTarget: el });
    expect(popover()).toBeInTheDocument();
  });

  it("opens on keyboard focus, closes on Escape and on blur out", () => {
    const { trigger, popover } = setup();
    fireEvent.focus(trigger);
    expect(popover()).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(popover()).not.toBeInTheDocument();
    fireEvent.focus(trigger);
    expect(popover()).toBeInTheDocument();
    fireEvent.blur(trigger, { relatedTarget: document.body });
    expect(popover()).not.toBeInTheDocument();
  });

  it("Tab from the trigger enters the portaled popover; tabbing out of its ends returns to the trigger", () => {
    const { trigger } = setup();
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: "Tab" });
    const first = screen.getByTestId("widget-link-1");
    const last = screen.getByTestId("widget-link-2");
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(trigger).toHaveFocus();
    act(() => last.focus());
    fireEvent.keyDown(last, { key: "Tab" });
    expect(trigger).toHaveFocus();
  });

  it("Escape inside the popover closes it and returns focus to the trigger", () => {
    const { trigger, popover } = setup();
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: "Tab" });
    fireEvent.keyDown(screen.getByTestId("widget-link-1"), { key: "Escape" });
    expect(popover()).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
