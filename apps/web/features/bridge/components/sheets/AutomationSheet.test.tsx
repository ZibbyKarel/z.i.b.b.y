import type { AutomationView } from "@zibby/contracts";
import { AnchoredSheetTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../../test/render";
import { AutomationFiresTestId } from "../../../automations/components/AutomationFires";
import { AutomationSheet, AutomationSheetTestId } from "./AutomationSheet";

const d = vi.hoisted(() => ({ trigger: vi.fn(), push: vi.fn(), lastFire: undefined as unknown }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: d.push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
const automation: AutomationView = {
  id: "nightly",
  name: "Nightly review",
  trigger: { type: "cron", expr: "0 3 * * *" },
  target: { type: "agent", agentId: "reviewer" },
  prompt: "Review yesterday's PRs",
  enabled: true,
  system: false,
};

vi.mock("../../../automations/queries", () => ({
  useAutomationsQuery: () => ({ data: [{ ...automation, lastFire: d.lastFire }] }),
}));
vi.mock("../../../runs/useRunLogStream", () => ({
  useAutomationFireLogStream: (_a: string, fireId: string | null) => ({
    text: fireId ? "start target=gap-detect\n" : "",
    done: false,
  }),
}));
vi.mock("../../../automations/mutations", () => ({
  useTriggerAutomationMutation: () => ({ mutate: d.trigger, isPending: false }),
}));

const anchor = {
  left: 0,
  width: 400,
  top: 0,
  height: 400,
  eL: 0,
  eT: 0,
  eH: 0,
  side: "r",
} as never;

describe("AutomationSheet", () => {
  it("shows the automation detail and runs it now", async () => {
    renderWithProviders(<AutomationSheet anchor={anchor} id="nightly" onClose={vi.fn()} />);
    expect(screen.getByTestId(AnchoredSheetTestId.Title)).toHaveTextContent("Nightly review");
    expect(screen.getByTestId(AutomationSheetTestId.Schedule)).toHaveTextContent("Denně v 03:00");
    expect(screen.getByTestId(AutomationSheetTestId.Prompt)).toHaveTextContent(
      "Review yesterday's PRs",
    );
    await userEvent.click(screen.getByTestId(AutomationSheetTestId.RunNow));
    expect(d.trigger).toHaveBeenCalledWith({ params: { id: "nightly" }, body: {} });
  });

  it("the title opens the automation detail page", async () => {
    renderWithProviders(<AutomationSheet anchor={anchor} id="nightly" onClose={vi.fn()} />);
    await userEvent.click(
      within(screen.getByTestId(AnchoredSheetTestId.Title)).getByRole("button"),
    );
    expect(d.push).toHaveBeenCalledWith("/work/automations/nightly");
  });

  it("shows a running in-process fire with its streamed log (todo-5)", () => {
    d.lastFire = {
      id: "fire_1_aaaaaa",
      automationId: "nightly",
      source: "manual",
      startedAt: "2026-11-12T08:00:00Z",
      status: "running",
    };
    renderWithProviders(<AutomationSheet anchor={anchor} id="nightly" onClose={vi.fn()} />);
    expect(screen.getByTestId(AutomationSheetTestId.LastFire)).toHaveTextContent("Běží");
    expect(screen.getByTestId(AutomationFiresTestId.Log)).toHaveTextContent(
      "start target=gap-detect",
    );
  });

  it("links a run-backed last fire to its run", () => {
    d.lastFire = {
      id: "fire_2_bbbbbb",
      automationId: "nightly",
      source: "cron",
      startedAt: "2026-11-12T08:00:00Z",
      finishedAt: "2026-11-12T08:00:01Z",
      durationMs: 1000,
      status: "done",
      runRef: "reviewer_42",
    };
    renderWithProviders(<AutomationSheet anchor={anchor} id="nightly" onClose={vi.fn()} />);
    expect(screen.getByTestId(AutomationFiresTestId.OpenRun)).toHaveAttribute(
      "href",
      "/activity/runs/reviewer_42",
    );
    d.lastFire = undefined;
  });

  it("renders nothing for an unknown id", () => {
    renderWithProviders(<AutomationSheet anchor={anchor} id="gone" onClose={vi.fn()} />);
    expect(screen.queryByTestId(AnchoredSheetTestId.Root)).toBeNull();
  });
});
