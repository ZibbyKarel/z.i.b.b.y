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

const eventAutomation: Automation = {
  id: "on-file",
  name: "Po události",
  trigger: { type: "event", events: ["file.created", "pr.opened"] },
  // A briefing target (no agent picker) so the round-trip doesn't depend on the
  // mocked-empty agents list — and it proves the prompt shows for a non-agent target.
  target: { type: "briefing" },
  prompt: "Piš stručně",
  enabled: true,
  system: false,
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
let automations: Automation[] = [automation];

vi.mock("./queries", () => ({
  useAutomationsQuery: () => ({ data: automations }),
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
    automations = [automation];
    trigger.mockClear();
    update.mockClear();
    create.mockClear();
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

  it("opens the edit dialog prefilled for an existing automation", () => {
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Edit));
    expect(screen.getByText("Upravit automatizaci")).toBeInTheDocument();
    expect(screen.getByTestId(AutomationFormTestId.Name)).toHaveValue("Ranní standup");
  });

  it("opens the create dialog from the header action with the prompt always visible", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Nová automatizace" }));
    expect(screen.getByTestId(AutomationFormTestId.Submit)).toBeInTheDocument();
    // The prompt is no longer agent-only — it's shown for every new automation.
    expect(screen.getByTestId(AutomationFormTestId.Prompt)).toBeInTheDocument();
  });

  it("edits an event automation: prompt is shown and round-trips with trigger.events", () => {
    automations = [eventAutomation];
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Edit));
    // Prompt is always visible (not only for agent targets) and prefilled from top-level.
    expect(screen.getByTestId(AutomationFormTestId.Prompt)).toHaveValue("Piš stručně");
    fireEvent.click(screen.getByTestId(AutomationFormTestId.Submit));
    expect(update).toHaveBeenCalledTimes(1);
    const body = update.mock.calls[0]?.[0]?.body;
    expect(body.trigger).toEqual({ type: "event", events: ["file.created", "pr.opened"] });
    expect(body.prompt).toBe("Piš stručně");
  });
});

describe("Automations Screen — system automation", () => {
  beforeEach(() => {
    automations = [systemAutomation];
    trigger.mockClear();
    update.mockClear();
    create.mockClear();
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

  it("on edit, persists only the schedule (trigger) — never target/enabled", () => {
    render(<Screen />);
    fireEvent.click(screen.getByTestId(AutomationCardTestId.Edit));
    // The schedule-only form has no target picker; submit saves trigger alone.
    fireEvent.click(screen.getByTestId(AutomationFormTestId.Submit));
    expect(update).toHaveBeenCalledTimes(1);
    const call = update.mock.calls[0]?.[0];
    expect(call.params).toEqual({ id: "memory-distill" });
    expect(Object.keys(call.body)).toEqual(["trigger"]);
    expect(call.body.trigger).toEqual({ type: "cron", expr: "0 3 * * *" });
  });
});
