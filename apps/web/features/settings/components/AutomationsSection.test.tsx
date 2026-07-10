import type { Automation } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders as render, screen } from "../../../test/render";
import { AutomationsSection } from "./AutomationsSection";
import { SystemAutomationRowTestId } from "./SystemAutomationRow";

const systemAutomation: Automation = {
  id: "memory-distill",
  name: "Destilace paměti",
  trigger: { type: "cron", expr: "0 3 * * *" },
  target: { type: "memory-distill" },
  enabled: true,
  system: true,
};

const userAutomation: Automation = {
  id: "morning-standup",
  name: "Ranní standup",
  trigger: { type: "cron", expr: "0 7 * * *" },
  target: { type: "briefing" },
  enabled: true,
  system: false,
};

const update = vi.fn();
const trigger = vi.fn();
const push = vi.fn();
const refetch = vi.fn();

const { query } = vi.hoisted(() => ({
  query: { automations: [] as Automation[], isPending: false, isError: false },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../automations/queries", () => ({
  useAutomationsQuery: () => ({
    data: query.automations,
    isPending: query.isPending,
    isError: query.isError,
    refetch,
  }),
}));
vi.mock("../../automations/mutations", () => ({
  useUpdateAutomationMutation: () => ({ mutate: update, isPending: false }),
  useTriggerAutomationMutation: () => ({ mutate: trigger, isPending: false }),
}));

describe("AutomationsSection", () => {
  beforeEach(() => {
    query.automations = [systemAutomation, userAutomation];
    query.isPending = false;
    query.isError = false;
    update.mockClear();
    trigger.mockClear();
    push.mockClear();
    refetch.mockClear();
  });

  it("shows only the system automations, not the operator's own", () => {
    render(<AutomationsSection />);
    expect(screen.getAllByText("Destilace paměti").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ranní standup")).not.toBeInTheDocument();
  });

  it("toggles a system automation on/off via the update mutation", () => {
    render(<AutomationsSection />);
    fireEvent.click(screen.getByTestId(SystemAutomationRowTestId.Toggle));
    expect(update).toHaveBeenCalledWith({
      params: { id: "memory-distill" },
      body: { enabled: false },
    });
  });

  it("edit navigates to the automation's detail page for rescheduling", () => {
    render(<AutomationsSection />);
    fireEvent.click(screen.getByTestId(SystemAutomationRowTestId.Edit));
    expect(push).toHaveBeenCalledWith("/automations/memory-distill");
  });

  it("shows the honest loading state while pending", () => {
    query.isPending = true;
    render(<AutomationsSection />);
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
  });

  it("shows the honest error state (with retry) on query failure", () => {
    query.isError = true;
    render(<AutomationsSection />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Zkusit znovu"));
    expect(refetch).toHaveBeenCalled();
  });
});
