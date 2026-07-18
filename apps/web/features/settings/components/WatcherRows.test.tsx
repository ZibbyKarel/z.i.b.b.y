import type { WatcherHealth } from "@zibby/contracts";
import { StatusDotTestId } from "@zibby/design-system";
import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { WatcherRows, WatcherRowsTestId } from "./WatcherRows";

const WATCHERS: WatcherHealth[] = [
  { id: "channel", status: "ok", tickMs: 30000, lastTickAt: "2026-07-17T00:00:00.000Z", ageMs: 5 },
  {
    id: "monitor",
    status: "stale",
    tickMs: 60000,
    lastTickAt: "2026-07-17T00:00:00.000Z",
    ageMs: 600000,
  },
  { id: "scheduler", status: "disabled", tickMs: 0 },
];

describe("WatcherRows (NS2 F6c)", () => {
  it("renders one testid'd row per watcher with its translated status", () => {
    render(<WatcherRows watchers={WATCHERS} />);
    expect(screen.getByTestId(WatcherRowsTestId.List)).toBeInTheDocument();
    expect(screen.getByTestId(`${WatcherRowsTestId.Row}-channel`)).toHaveTextContent("OK");
    expect(screen.getByTestId(`${WatcherRowsTestId.Row}-monitor`)).toHaveTextContent("Zamrzlý");
    expect(screen.getByTestId(`${WatcherRowsTestId.Row}-scheduler`)).toHaveTextContent("Vypnutý");
  });

  it("a stale row shows the warning tone; disabled shows the faint dot", () => {
    render(<WatcherRows watchers={WATCHERS} />);
    const staleDot = within(screen.getByTestId(`${WatcherRowsTestId.Row}-monitor`)).getByTestId(
      StatusDotTestId.Dot,
    );
    expect(staleDot).toHaveClass("bg-warn");
    const disabledDot = within(
      screen.getByTestId(`${WatcherRowsTestId.Row}-scheduler`),
    ).getByTestId(StatusDotTestId.Dot);
    expect(disabledDot).toHaveClass("bg-foreground-faint");
  });

  it("absent or empty watchers render nothing (no crash on an old API payload)", () => {
    render(<WatcherRows />);
    expect(screen.queryByTestId(WatcherRowsTestId.List)).not.toBeInTheDocument();
    render(<WatcherRows watchers={[]} />);
    expect(screen.queryByTestId(WatcherRowsTestId.List)).not.toBeInTheDocument();
  });
});
