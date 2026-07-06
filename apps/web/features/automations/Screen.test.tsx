import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automation } from "@zibby/contracts";
import { fireEvent, renderWithProviders as render, screen } from "../../test/render";
import { Screen } from "./Screen";
import { AutomationCardTestId } from "./components/AutomationCard";
import { AutomationFormTestId } from "./components/AutomationFormDialog";

const automation: Automation = {
  id: "morning-standup",
  name: "Ranní standup",
  trigger: { type: "cron", expr: "0 7 * * *" },
  target: { type: "briefing" },
  enabled: true,
  system: false,
  lastFiredAt: "2026-06-12T07:00:00.000Z",
};

const systemAutomation: Automation = {
  id: "memory-distill",
  name: "Destilace paměti",
  trigger: { type: "cron", expr: "0 3 * * *" },
  target: { type: "memory-distill" },
  enabled: true,
  system: true,
};

const trigger = vi.fn();
const update = vi.fn();
const create = vi.fn();
const push = vi.fn();
const refetch = vi.fn();

const { query } = vi.hoisted(() => ({
  query: { automations: [] as Automation[], isPending: false, isError: false },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./queries", () => ({
  useAutomationsQuery: () => ({
    data: query.automations,
    isPending: query.isPending,
    isError: query.isError,
    refetch,
  }),
}));
vi.mock("../agents/queries", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../pipelines/queries", () => ({ usePipelinesQuery: () => ({ data: [] }) }));
vi.mock("./mutations", () => ({
  useCreateAutomationMutation: () => ({ mutate: create, isPending: false }),
  useUpdateAutomationMutation: () => ({ mutate: update, isPending: false }),
  useTriggerAutomationMutation: () => ({ mutate: trigger, isPending: false }),
}));

describe("Automations Screen", () => {
  beforeEach(() => {
    query.automations = [automation];
    query.isPending = false;
    query.isError = false;
    trigger.mockClear();
    update.mockClear();
    create.mockClear();
    push.mockClear();
    refetch.mockClear();
  });

  it("shows the honest loading state while the primary query is pending (Phase 18.2)", () => {
    query.isPending = true;
    render(<Screen />);
    expect(screen.getByText("Načítání…")).toBeInTheDocument();
    expect(screen.queryByTestId(AutomationCardTestId.Root)).not.toBeInTheDocument();
  });

  it("shows the honest error state (with retry) when the primary query fails — never an empty workspace", () => {
    query.isError = true;
    render(<Screen />);
    expect(screen.getByText("Nepodařilo se načíst")).toBeInTheDocument();
    expect(screen.queryByText("Zatím žádné automatizace")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Zkusit znovu"));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the cron automation with a human-readable schedule (not raw cron)", () => {
    render(<Screen />);
    expect(screen.getByTestId(AutomationCardTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Ranní standup")).toBeInTheDocument();
    // "0 7 * * *" → cs "Denně v 07:00", and the raw expression is never shown.
    expect(screen.getByTestId(AutomationCardTestId.Schedule)).toHaveTextContent("Denně v 07:00");
    expect(screen.queryByText("0 7 * * *")).not.toBeInTheDocument();
  });

  it("runs an automation now via the trigger mutation", () => {
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Run));
    expect(trigger).toHaveBeenCalledWith({ params: { id: "morning-standup" }, body: {} });
  });

  it("toggles enabled via the update mutation", () => {
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Toggle));
    expect(update).toHaveBeenCalledWith({
      params: { id: "morning-standup" },
      body: { enabled: false },
    });
  });

  it("Edit NAVIGATES to the automation detail route (N4f grammar) — no dialog", () => {
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Edit));
    expect(push).toHaveBeenCalledWith("/automations/morning-standup");
    expect(screen.queryByText("Upravit automatizaci")).toBeNull();
  });

  it("opens the create dialog from the header action with the prompt always visible", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Nová automatizace" }));
    expect(screen.getByTestId(AutomationFormTestId.Submit)).toBeInTheDocument();
    // The prompt is no longer agent-only — it's shown for every new automation.
    expect(screen.getByTestId(AutomationFormTestId.Prompt)).toBeInTheDocument();
  });
});

describe("Automations Screen — system automation", () => {
  beforeEach(() => {
    query.automations = [systemAutomation];
    query.isPending = false;
    query.isError = false;
    trigger.mockClear();
    update.mockClear();
    create.mockClear();
    push.mockClear();
  });

  it("shows the system badge and renders the memory-distill target label", () => {
    render(<Screen />);
    expect(screen.getByTestId(AutomationCardTestId.SystemBadge)).toHaveTextContent("Systémová");
    // Goes through Screen.resolveTarget → the real label/glyph mapping path.
    expect(screen.getByTestId(AutomationCardTestId.Target)).toHaveTextContent("Destilace paměti");
  });

  it("disables the enable toggle so it can't be flipped (server rejects it)", () => {
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Toggle));
    expect(screen.getByTestId(AutomationCardTestId.Toggle)).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("Edit navigates to the detail (the schedule-only lock lives there now)", () => {
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Edit));
    expect(push).toHaveBeenCalledWith("/automations/memory-distill");
    expect(update).not.toHaveBeenCalled();
  });
});
