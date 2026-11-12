import type { AutomationFire } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { AutomationFires, AutomationFiresTestId } from "./AutomationFires";

const d = vi.hoisted(() => ({
  fires: [] as AutomationFire[],
  runs: [] as { runId: string; status: string }[],
}));
vi.mock("../../runs/queries/useRunsQuery", () => ({ useRunsQuery: () => ({ runs: d.runs }) }));
vi.mock("../queries", () => ({
  useAutomationFiresQuery: () => ({ data: d.fires, isPending: false }),
}));
vi.mock("../../runs/useRunLogStream", () => ({
  useAutomationFireLogStream: (_a: string, fireId: string | null) => ({
    text: fireId ? `log of ${fireId}\n` : "",
    done: true,
  }),
}));

const fire = (over: Partial<AutomationFire>): AutomationFire => ({
  id: "fire_1_aaaaaa",
  automationId: "nightly",
  source: "cron",
  startedAt: "2026-11-12T07:00:00Z",
  finishedAt: "2026-11-12T07:00:45Z",
  durationMs: 45_000,
  status: "done",
  result: "gaps:2",
  ...over,
});

beforeEach(() => {
  d.runs = [];
  d.fires = [
    fire({
      id: "fire_3_cccccc",
      startedAt: "2026-11-12T09:00:00Z",
      status: "error",
      error: "boom",
    }),
    fire({ id: "fire_2_bbbbbb", startedAt: "2026-11-12T08:00:00Z", runRef: "run_7" }),
    fire({ id: "fire_1_aaaaaa" }),
  ];
});

describe("AutomationFires", () => {
  it("lists fires newest first with status and duration, the first selected", () => {
    renderWithProviders(<AutomationFires automationId="nightly" />);
    const rows = screen.getAllByTestId(AutomationFiresTestId.Row);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("boom");
    expect(rows[0]).toHaveTextContent("45s");
    expect(screen.getAllByTestId(AutomationFiresTestId.Status)[0]).toHaveTextContent("Selhalo");
    expect(screen.getByTestId(AutomationFiresTestId.Log)).toHaveTextContent("log of fire_3_cccccc");
  });

  it("clicking a row shows its log; a run-backed fire links to its run", async () => {
    renderWithProviders(<AutomationFires automationId="nightly" />);
    const rows = screen.getAllByTestId(AutomationFiresTestId.Row);
    await userEvent.click(rows[2] as HTMLElement);
    expect(screen.getByTestId(AutomationFiresTestId.Log)).toHaveTextContent("log of fire_1_aaaaaa");
    await userEvent.click(rows[1] as HTMLElement);
    expect(screen.queryByTestId(AutomationFiresTestId.Log)).toBeNull();
    expect(screen.getByTestId(AutomationFiresTestId.OpenRun)).toHaveAttribute(
      "href",
      "/activity/runs/run_7",
    );
  });

  it("a run-backed fire whose run isn't cached shows Spuštěno", () => {
    renderWithProviders(<AutomationFires automationId="nightly" />);
    expect(screen.getAllByTestId(AutomationFiresTestId.Status)[1]).toHaveTextContent("Spuštěno");
  });

  it("a run-backed fire whose run is cached shows the run's state", () => {
    d.runs = [{ runId: "run_7", status: "error" }];
    renderWithProviders(<AutomationFires automationId="nightly" />);
    const pill = screen.getAllByTestId(AutomationFiresTestId.Status)[1];
    expect(pill).toHaveTextContent("chyba");
  });

  it("renders an empty state with no fires", () => {
    d.fires = [];
    renderWithProviders(<AutomationFires automationId="nightly" />);
    expect(screen.getByTestId(AutomationFiresTestId.List)).toBeInTheDocument();
    expect(screen.queryAllByTestId(AutomationFiresTestId.Row)).toHaveLength(0);
  });
});
