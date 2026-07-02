import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automation } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render, screen } from "../../test/render";
import { AutomationDetailScreenTestId, DetailScreen } from "./DetailScreen";
import { AutomationFormTestId } from "./components/AutomationFormFields";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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

const { hooks } = vi.hoisted(() => ({
  hooks: {
    automation: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
    update: vi.fn(),
    del: vi.fn(),
    trigger: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useAutomationQuery: () => hooks.automation,
}));
vi.mock("../agents/queries", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../pipelines/queries", () => ({ usePipelinesQuery: () => ({ data: [] }) }));
vi.mock("./mutations", () => ({
  useUpdateAutomationMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteAutomationMutation: () => ({ mutate: hooks.del, isPending: false }),
  useTriggerAutomationMutation: () => ({ mutate: hooks.trigger, isPending: false }),
}));

describe("automations DetailScreen (N4f grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.trigger.mockClear();
    hooks.automation = { data: eventAutomation, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("page is the edit surface: prompt prefills and Save round-trips the full patch", async () => {
    render(<DetailScreen automationId="on-file" />);
    expect(screen.getByTestId(AutomationFormTestId.Prompt)).toHaveValue("Piš stručně");
    await userEvent.click(screen.getByTestId(AutomationDetailScreenTestId.Save));
    expect(hooks.update).toHaveBeenCalledTimes(1);
    const body = hooks.update.mock.calls[0]![0].body;
    expect(body.trigger).toEqual({ type: "event", events: ["file.created", "pr.opened"] });
    expect(body.prompt).toBe("Piš stručně");
    expect(body.enabled).toBe(true);
  });

  it("Run now fires the trigger mutation from the top-right", async () => {
    render(<DetailScreen automationId="on-file" />);
    await userEvent.click(screen.getByTestId(AutomationDetailScreenTestId.Run));
    expect(hooks.trigger).toHaveBeenCalledWith({ params: { id: "on-file" }, body: {} });
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /automations", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<DetailScreen automationId="on-file" />);
    await userEvent.click(screen.getByTestId(AutomationDetailScreenTestId.Delete));
    expect(screen.getByText("Smazat automatizaci?")).toBeInTheDocument();
    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId(AutomationDetailScreenTestId.Delete));
    await userEvent.click(confirm!);
    expect(hooks.del).toHaveBeenCalledWith(
      { params: { id: "on-file" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/automations");
  });

  describe("system automation", () => {
    beforeEach(() => {
      hooks.automation = {
        data: systemAutomation,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    it("Save persists ONLY the schedule (trigger) — never target/name/enabled", async () => {
      render(<DetailScreen automationId="memory-distill" />);
      // The schedule-only form has no name field or target picker.
      expect(screen.queryByTestId(AutomationFormTestId.Name)).toBeNull();
      expect(screen.queryByTestId(AutomationFormTestId.Prompt)).toBeNull();
      await userEvent.click(screen.getByTestId(AutomationDetailScreenTestId.Save));
      expect(hooks.update).toHaveBeenCalledTimes(1);
      const call = hooks.update.mock.calls[0]![0];
      expect(call.params).toEqual({ id: "memory-distill" });
      expect(Object.keys(call.body)).toEqual(["trigger"]);
      expect(call.body.trigger).toEqual({ type: "cron", expr: "0 3 * * *" });
    });

    it("offers no Delete affordance (the server 409s it anyway)", () => {
      render(<DetailScreen automationId="memory-distill" />);
      expect(screen.queryByTestId(AutomationDetailScreenTestId.Delete)).toBeNull();
    });
  });
});
