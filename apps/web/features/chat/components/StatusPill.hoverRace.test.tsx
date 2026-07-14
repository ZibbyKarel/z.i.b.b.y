import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { CLOSE_GRACE_MS } from "../statusFlyout";
import { StatusFlyoutTestId } from "./StatusFlyoutPanel";
import { StatusPill, StatusPillTestId } from "./StatusPill";

vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "a", name: "A", color: "#fff", state: "running" },
      { id: "b", name: "B", color: "#fff", state: "waiting" },
    ],
  }),
}));

vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => ({ runs: [], isPending: false, isError: false, refetch: vi.fn() }),
  useRunGlyphMap: () => new Map(),
}));

vi.mock("../../approvals", () => ({
  useApprovalsQuery: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useApproveMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

/**
 * Live-verify regression (.superpowers/sdd3/task-7-report.md, checklist item 3):
 * with the panel open, hovering FROM THE PANEL directly onto the OTHER trigger
 * segment must swap sections, not close. This only reproduces through the real
 * (un-mocked) StatusFlyoutPanel — StatusPill.test.tsx mocks it out and only
 * covers trigger-to-trigger hover, which already worked.
 *
 * jsdom's default synthetic dispatch doesn't reproduce the real-browser
 * event-ordering race the report instrumented (that's why it needed live
 * browser verification), so the exact reported sequence is fired manually:
 * the new trigger's pointerenter (which swaps the section) fires, and only
 * AFTER that does the panel's stale mouseleave — armed by leaving the panel
 * toward the pill — get processed, with nothing left to cancel it.
 */
describe("StatusPill hover-race regression (section-swap close race)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not close when the panel's mouseleave targets the other trigger", () => {
    renderWithProviders(<StatusPill />);
    const working = screen.getByTestId(StatusPillTestId.Working);
    const waiting = screen.getByTestId(StatusPillTestId.Waiting);

    act(() => working.focus()); // instant open, working section
    const panel = screen.getByTestId(StatusFlyoutTestId.Root);
    expect(waiting).toHaveAttribute("aria-expanded", "false");

    // Reported order: the new trigger's own enter fires first — this is what
    // actually swaps activeSection to "waiting" — and only afterward does the
    // panel's mouseleave (which the browser dispatched for leaving the panel
    // toward the pill) get processed.
    act(() => {
      fireEvent.pointerEnter(waiting);
    });
    act(() => {
      fireEvent.mouseLeave(panel, { relatedTarget: waiting });
    });

    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));

    expect(screen.getByTestId(StatusFlyoutTestId.Root)).toBeInTheDocument();
    expect(waiting).toHaveAttribute("aria-expanded", "true");
  });
});
