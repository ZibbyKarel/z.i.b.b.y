import type { Automation } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { AutomationRunsWidget, AutomationRunsWidgetTestId } from "./AutomationRunsWidget";

const d = vi.hoisted(() => ({ live: [] as unknown[], automations: [] as Automation[] }));

vi.mock("../../runs/components/TasksDockPanel", () => ({ useLiveRuns: () => d.live }));
vi.mock("../../automations/queries", () => ({
  useAutomationsQuery: () => ({ data: d.automations, isPending: false }),
}));

const widget: BridgeWidget = { id: "w-a", type: "automationRuns", x: 0, y: 0, w: 4, h: 8 };
const onOpen = vi.fn();
const props: BridgeWidgetProps = {
  widget,
  adding: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen,
  epicClosed: {},
  onEpicToggle: vi.fn(),
};
const cron = (id: string, expr: string, enabled = true): Automation => ({
  id,
  name: `Auto ${id}`,
  trigger: { type: "cron", expr },
  target: { type: "briefing" },
  enabled,
  system: false,
});

// 2026-11-11 12:00 Europe/Prague (CET, UTC+1).
const NOW = Date.parse("2026-11-11T11:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  onOpen.mockClear();
  d.live = [
    {
      runId: "r1",
      status: "running",
      kind: "agent",
      owner: "writer",
      project: "p",
      title: "r1",
      startedAt: "2026-11-11T10:05:00Z",
      automationId: "nightly",
    },
    // A live run NOT fired by an automation — never shown here.
    {
      runId: "r2",
      status: "running",
      kind: "agent",
      owner: "x",
      project: "p",
      title: "r2",
      startedAt: "2026-11-11T10:05:00Z",
    },
  ];
  d.automations = [
    cron("nightly", "0 3 * * *"), // tomorrow 03:00 — within 24 h
    cron("evening", "30 18 * * *"), // today 18:30
    cron("off", "0 13 * * *", false), // disabled — not upcoming
    cron("monthly", "0 9 1 * *"), // next 1st of the month — beyond 24 h
  ];
});

afterEach(() => vi.useRealTimers());

const key = (id: string) => `${widget.id}:${id}`;

describe("AutomationRunsWidget", () => {
  it("lists running automation runs and the next fires within 24 h, soonest first", () => {
    renderWithProviders(<AutomationRunsWidget {...props} />);
    expect(screen.getByTestId(`${AutomationRunsWidgetTestId.Time}-${key("r1")}`)).toHaveTextContent(
      "11:05",
    );
    expect(screen.queryByTestId(`${AutomationRunsWidgetTestId.Time}-${key("r2")}`)).toBeNull();
    const upcoming = screen.getAllByTestId(
      new RegExp(`^${AutomationRunsWidgetTestId.Time}-${widget.id}:next:`),
    );
    expect(upcoming.map((n) => n.textContent)).toEqual(["18:30", "03:00"]);
    // The running row is titled by its automation's name (as is its upcoming row).
    expect(screen.getAllByText("Auto nightly")).toHaveLength(2);
  });

  it("opens the automation sheet from a running and an upcoming row", async () => {
    renderWithProviders(<AutomationRunsWidget {...props} />);
    await userEvent.click(screen.getByTestId(`${AutomationRunsWidgetTestId.Time}-${key("r1")}`));
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "automation", id: "nightly", key: key("r1") }),
    );
    await userEvent.click(
      screen.getByTestId(`${AutomationRunsWidgetTestId.Time}-${key("next:evening")}`),
    );
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "automation",
        id: "evening",
        href: "/work/automations/evening",
      }),
    );
  });
});
