import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { StatusPill, StatusPillTestId } from "./StatusPill";

vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "a", name: "A", color: "#fff", state: "running" },
      { id: "b", name: "B", color: "#fff", state: "running" },
      { id: "c", name: "C", color: "#fff", state: "report" },
      { id: "d", name: "D", color: "#fff", state: "waiting" },
    ],
  }),
}));

vi.mock("./StatusFlyoutPanel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./StatusFlyoutPanel")>();
  return {
    ...actual,
    StatusFlyoutPanel: ({ section }: { section: string }) => (
      <div data-testid="chat-status-flyout" id={actual.STATUS_FLYOUT_PANEL_ID}>
        {section}
      </div>
    ),
  };
});

describe("StatusPill", () => {
  it("shows per-state counts derived from the subsystem roster", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Working)).toHaveTextContent("2");
    expect(screen.getByTestId(StatusPillTestId.Report)).toHaveTextContent("1");
    expect(screen.getByTestId(StatusPillTestId.Waiting)).toHaveTextContent("1");
  });

  it("renders the pill root", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Root)).toBeInTheDocument();
  });

  it("exposes working and waiting segments as flyout trigger buttons; report stays plain", () => {
    renderWithProviders(<StatusPill />);
    const working = screen.getByTestId(StatusPillTestId.Working);
    expect(working.tagName).toBe("BUTTON");
    expect(working).toHaveAttribute("aria-haspopup", "dialog");
    expect(working).toHaveAttribute("aria-controls");
    expect(screen.getByTestId(StatusPillTestId.Waiting).tagName).toBe("BUTTON");
    expect(screen.getByTestId(StatusPillTestId.Report).tagName).not.toBe("BUTTON");
  });

  it("opens the section on trigger focus and closes on Escape without reopening", async () => {
    renderWithProviders(<StatusPill />);
    const working = screen.getByTestId(StatusPillTestId.Working);
    act(() => working.focus());
    expect(working).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("chat-status-flyout")).toHaveTextContent("working");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("chat-status-flyout")).toBeNull();
    // Escape restored focus to the trigger; the restore must NOT re-open.
    expect(working).toHaveFocus();
    expect(working).toHaveAttribute("aria-expanded", "false");
  });

  it("swaps sections when the other trigger is hovered", async () => {
    renderWithProviders(<StatusPill />);
    await userEvent.hover(screen.getByTestId(StatusPillTestId.Working));
    expect(screen.getByTestId("chat-status-flyout")).toHaveTextContent("working");
    await userEvent.hover(screen.getByTestId(StatusPillTestId.Waiting));
    expect(screen.getByTestId("chat-status-flyout")).toHaveTextContent("waiting");
  });
});
