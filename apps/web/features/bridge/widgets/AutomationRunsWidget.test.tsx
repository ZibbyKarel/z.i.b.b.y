import type { AutomationFire, AutomationView } from "@zibby/contracts";
import type { RunView } from "../../runs/run";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import {
  AutomationRunsWidget,
  AutomationRunsWidgetTestId,
  automationRowState,
} from "./AutomationRunsWidget";

const d = vi.hoisted(() => ({
  live: [] as unknown[],
  runs: [] as unknown[],
  automations: [] as AutomationView[],
}));

vi.mock("../../runs/components/TasksDockPanel", () => ({ useLiveRuns: () => d.live }));
vi.mock("../../runs/queries/useRunsQuery", () => ({ useRunsQuery: () => ({ runs: d.runs }) }));
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
const cron = (id: string, expr: string, enabled = true): AutomationView => ({
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
  d.runs = [];
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
    // `nightly` is running (live run r1), so it is not also listed as upcoming (todo-5).
    expect(upcoming.map((n) => n.textContent)).toEqual(["18:30"]);
    // The running row is titled by its automation's name.
    expect(screen.getAllByText("Auto nightly")).toHaveLength(1);
  });

  it("marks system automations with a warn shield and user ones with an accent user icon (todo-7)", () => {
    d.automations = d.automations.map((a) => (a.id === "nightly" ? { ...a, system: true } : a));
    renderWithProviders(<AutomationRunsWidget {...props} />);
    const running = screen.getByTestId(`${AutomationRunsWidgetTestId.Kind}-${key("r1")}`);
    expect(running).toHaveAccessibleName("Systémová automatizace");
    expect(running.querySelector("[data-icon]")).toHaveAttribute("data-icon", "shield");
    expect(running.querySelector("[data-icon]")).toHaveClass("text-warn");
    const upcoming = screen.getByTestId(
      `${AutomationRunsWidgetTestId.Kind}-${key("next:evening")}`,
    );
    expect(upcoming).toHaveAccessibleName("Uživatelská automatizace");
    expect(upcoming.querySelector("[data-icon]")).toHaveAttribute("data-icon", "user");
    expect(upcoming.querySelector("[data-icon]")).toHaveClass("text-accent");
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

const fire = (over: Partial<AutomationFire>): AutomationFire => ({
  id: "fire_1_aaaaaa",
  automationId: "evening",
  source: "cron",
  startedAt: "2026-11-11T10:30:00Z",
  status: "done",
  ...over,
});
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("AutomationRunsWidget — running and failed fires (todo-5)", () => {
  it("shows an in-process running fire once, in the running group only", () => {
    d.automations = [{ ...cron("evening", "30 18 * * *"), lastFire: fire({ status: "running" }) }];
    renderWithProviders(<AutomationRunsWidget {...props} />);
    expect(
      screen.getByTestId(`${AutomationRunsWidgetTestId.Time}-${key("fire:evening")}`),
    ).toHaveTextContent("11:30");
    expect(
      screen.queryByTestId(`${AutomationRunsWidgetTestId.Time}-${key("next:evening")}`),
    ).toBeNull();
    expect(screen.getAllByText("Auto evening")).toHaveLength(1);
  });

  it("marks an automation whose fire failed 1 h ago, still showing its next fire time", () => {
    d.automations = [
      {
        ...cron("evening", "30 18 * * *"),
        lastFire: fire({ status: "error", error: "boom", finishedAt: hoursAgo(1) }),
      },
    ];
    renderWithProviders(<AutomationRunsWidget {...props} />);
    expect(
      screen.getByTestId(`${AutomationRunsWidgetTestId.Failed}-${key("next:evening")}`),
    ).toHaveTextContent("Selhalo");
    expect(
      screen.getByTestId(`${AutomationRunsWidgetTestId.Time}-${key("next:evening")}`),
    ).toHaveTextContent("18:30");
  });

  it("surfaces a recent failure of an automation with no upcoming slot in the running group", () => {
    d.live = [];
    d.automations = [
      {
        ...cron("manual", "0 3 * * *"),
        trigger: { type: "event", events: ["git.push"] },
        lastFire: fire({ automationId: "manual", status: "error", finishedAt: hoursAgo(2) }),
      },
      {
        ...cron("old", "0 3 * * *", false),
        lastFire: fire({ status: "error", finishedAt: hoursAgo(30) }),
      },
    ];
    renderWithProviders(<AutomationRunsWidget {...props} />);
    expect(
      screen.getByTestId(`${AutomationRunsWidgetTestId.Failed}-${key("failed:manual")}`),
    ).toHaveTextContent("Selhalo");
    expect(
      screen.getByTestId(`${AutomationRunsWidgetTestId.Time}-${key("failed:manual")}`),
    ).toHaveTextContent("10:00");
    expect(
      screen.queryByTestId(`${AutomationRunsWidgetTestId.Failed}-${key("failed:old")}`),
    ).toBeNull();
  });

  it("shows a plain upcoming row once the failure is older than 24 h", () => {
    d.automations = [
      {
        ...cron("evening", "30 18 * * *"),
        lastFire: fire({ status: "error", finishedAt: hoursAgo(25) }),
      },
    ];
    renderWithProviders(<AutomationRunsWidget {...props} />);
    expect(
      screen.queryByTestId(`${AutomationRunsWidgetTestId.Failed}-${key("next:evening")}`),
    ).toBeNull();
    expect(
      screen.getByTestId(`${AutomationRunsWidgetTestId.Time}-${key("next:evening")}`),
    ).toBeInTheDocument();
  });
});

describe("automationRowState", () => {
  const a = cron("evening", "30 18 * * *");
  const run = (over: Partial<RunView>): RunView =>
    ({
      runId: "run_1",
      status: "running",
      kind: "agent",
      owner: "writer",
      project: "p",
      title: "t",
      startedAt: hoursAgo(2),
      automationId: "evening",
      ...over,
    }) as RunView;

  it("is running while a live run of the automation exists", () => {
    expect(automationRowState(a, run({}), undefined, NOW)).toEqual({
      kind: "running",
      startedAt: hoursAgo(2),
    });
  });

  it("is running while an in-process fire runs", () => {
    const f = fire({ status: "running", startedAt: hoursAgo(1) });
    expect(automationRowState({ ...a, lastFire: f }, undefined, undefined, NOW)).toEqual({
      kind: "running",
      startedAt: hoursAgo(1),
    });
  });

  it("is failed for an in-process error within 24 h", () => {
    const f = fire({ status: "error", finishedAt: hoursAgo(3) });
    expect(automationRowState({ ...a, lastFire: f }, undefined, undefined, NOW)).toEqual({
      kind: "failed",
      at: hoursAgo(3),
    });
  });

  it("is idle when a newer done fire followed the error", () => {
    const f = fire({ status: "done", finishedAt: hoursAgo(1) });
    expect(automationRowState({ ...a, lastFire: f }, undefined, undefined, NOW)).toEqual({
      kind: "idle",
    });
  });

  it("is failed when the automation's latest run errored within 24 h", () => {
    const latest = run({
      status: "error",
      startedAt: hoursAgo(5),
      taskOutcomeFinishedAt: hoursAgo(4),
    });
    const f = fire({ status: "done", startedAt: hoursAgo(5), runRef: "run_1" });
    expect(automationRowState({ ...a, lastFire: f }, undefined, latest, NOW)).toEqual({
      kind: "failed",
      at: hoursAgo(4),
    });
  });

  it("ignores an errored run older than the automation's newest fire", () => {
    const latest = run({ status: "error", startedAt: hoursAgo(5) });
    const f = fire({ status: "done", startedAt: hoursAgo(1), finishedAt: hoursAgo(1) });
    expect(automationRowState({ ...a, lastFire: f }, undefined, latest, NOW)).toEqual({
      kind: "idle",
    });
  });
});
