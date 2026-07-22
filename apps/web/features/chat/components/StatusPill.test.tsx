import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusDotTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { StatusPill, StatusPillTestId } from "./StatusPill";

vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "a", name: "A", color: "#fff", state: "running" },
      { id: "b", name: "B", color: "#fff", state: "running" },
      { id: "c", name: "C", color: "#fff", state: "report" },
      { id: "d", name: "D", color: "#fff", state: "waiting" },
      { id: "e", name: "E", color: "#fff", state: "error" },
    ],
  }),
}));

// Mutable stub (F8b): each health test overrides the shape mid-suite, then
// `beforeEach` below resets it to the nominal/online default so the earlier
// non-health tests (which never touch this) keep exercising the common case.
interface HealthStub {
  data: { status: "ok" | "degraded" } | undefined;
  isFetching: boolean;
  isFetched: boolean;
  isSuccess: boolean;
}
const health = vi.hoisted(
  (): HealthStub => ({
    data: { status: "ok" },
    isFetching: false,
    isFetched: true,
    isSuccess: true,
  }),
);
vi.mock("../../health", () => ({ useHealthQuery: () => health }));

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
    expect(screen.getByTestId(StatusPillTestId.Error)).toHaveTextContent("1");
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

  it("does not draw its own border (single glass border, no doubling)", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Root)).not.toHaveClass("border-border");
  });
});

describe("StatusPill health (F8b)", () => {
  beforeEach(() => {
    health.data = { status: "ok" };
    health.isFetching = false;
    health.isFetched = true;
    health.isSuccess = true;
  });

  // `renderWithProviders` mounts the real `cs` catalog (the app default), so
  // assertions read the Czech strings, not the English source above.
  it("shows Nominální with no detail line when the API is healthy (unchanged common case)", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Health)).toHaveTextContent("Nominální");
    expect(screen.getAllByTestId(StatusDotTestId.Dot)[0]).toHaveClass("bg-ok");
    expect(screen.queryByTestId(StatusPillTestId.HealthDetail)).toBeNull();
  });

  it("shows a pulsing Připojuji (connecting) state while the first health fetch is in flight", () => {
    health.isFetching = true;
    health.isFetched = false;
    health.isSuccess = false;
    health.data = undefined;
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Health)).toHaveTextContent("Připojuji");
    // Connecting is a transient in-flight state, not yet a confirmed fault —
    // no "api unreachable" detail line until the fetch actually settles.
    expect(screen.queryByTestId(StatusPillTestId.HealthDetail)).toBeNull();
  });

  it("shows Offline with a detail line when the health poll does not answer", () => {
    health.isFetching = false;
    health.isFetched = true;
    health.isSuccess = false;
    health.data = undefined;
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Health)).toHaveTextContent("Offline");
    expect(screen.getAllByTestId(StatusDotTestId.Dot)[0]).toHaveClass("bg-bad");
    expect(screen.getByTestId(StatusPillTestId.HealthDetail)).toHaveTextContent("nedostupné");
  });

  it("shows Degradováno (degraded) with a detail line when the API answers but reports degraded", () => {
    health.data = { status: "degraded" };
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Health)).toHaveTextContent("Degradováno");
    expect(screen.getAllByTestId(StatusDotTestId.Dot)[0]).toHaveClass("bg-warn");
    expect(screen.getByTestId(StatusPillTestId.HealthDetail)).toHaveTextContent("claude cli");
  });
});
