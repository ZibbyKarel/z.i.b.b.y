import { describe, expect, it, vi } from "vitest";
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
  lastFiredAt: "2026-06-12T07:00:00.000Z",
};

const trigger = vi.fn();
const update = vi.fn();
const create = vi.fn();

vi.mock("./queries", () => ({
  useAutomationsQuery: () => ({ data: [automation] }),
}));
vi.mock("../agents/queries", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../pipelines/queries", () => ({ usePipelinesQuery: () => ({ data: [] }) }));
vi.mock("./mutations", () => ({
  useCreateAutomationMutation: () => ({ mutate: create, isPending: false }),
  useUpdateAutomationMutation: () => ({ mutate: update, isPending: false }),
  useTriggerAutomationMutation: () => ({ mutate: trigger, isPending: false }),
}));

describe("Automations Screen", () => {
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

  it("opens the create dialog from the header action", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Nová automatizace" }));
    expect(screen.getByTestId(AutomationFormTestId.Submit)).toBeInTheDocument();
  });
});
