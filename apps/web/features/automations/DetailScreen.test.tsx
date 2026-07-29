import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automation } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render, screen } from "../../test/render";
import { AutomationDetailScreenTestId, DetailScreen } from "./DetailScreen";
import { CommandLineTestId } from "../tasks/components/CommandLine/CommandLine";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const legacyAutomation: Automation = {
  id: "on-file",
  name: "Po události",
  trigger: { type: "event", events: ["file.created", "pr.opened"] },
  // A briefing target predates the `task` shape (Phase 116b) — the detail page
  // falls back to a minimal schedule-only editor for it rather than crashing.
  target: { type: "briefing" },
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

const taskAutomation: Automation = {
  id: "check-prs",
  name: "Zkontroluj PR",
  trigger: { type: "cron", expr: "0 8 * * *" },
  target: {
    type: "task",
    text: "Zkontroluj otevřené PR",
    target: { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
    attachmentSetId: "set-1",
  },
  enabled: true,
  system: false,
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
vi.mock("./mutations", () => ({
  useUpdateAutomationMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteAutomationMutation: () => ({ mutate: hooks.del, isPending: false }),
  useTriggerAutomationMutation: () => ({ mutate: hooks.trigger, isPending: false }),
}));
// The `task` edit surface mounts the REAL `CommandLine` (not a stub) — mirrors
// Screen.test.tsx's / ChatScreen.test.tsx's own mocking pattern for the same
// component: stub every query/mutation it reads so mounting never hits the
// network, but let the component itself run for real.
vi.mock("../agents/queries", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../pipelines/queries", () => ({ usePipelinesQuery: () => ({ data: [] }) }));
vi.mock("../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({ data: [] }),
  getSubsystemsQueryKey: () => ["subsystems"],
}));
vi.mock("../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({ data: [] }),
  getProjectsQueryKey: () => ["projects"],
}));
vi.mock("../limits/queries/useLimitsQuery", () => ({
  useLimitsQuery: () => ({
    data: {
      rolling: { usedPct: 10, resetsAt: null },
      weekly: { usedPct: 5, resetsAt: null },
      capturedAt: Date.now(),
      stale: false,
    },
  }),
  getLimitsQueryKey: () => ["limits"],
}));
vi.mock("../tasks/mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("automations DetailScreen (N4f grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.trigger.mockClear();
    hooks.automation = {
      data: legacyAutomation,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
  });

  describe("legacy (non-task, non-system) target — schedule-only fallback", () => {
    it("Save persists ONLY the schedule (trigger) — the retired target picker never comes back", async () => {
      render(<DetailScreen automationId="on-file" />);
      await userEvent.click(screen.getByTestId(AutomationDetailScreenTestId.Save));
      expect(hooks.update).toHaveBeenCalledTimes(1);
      const body = hooks.update.mock.calls[0]![0].body;
      expect(Object.keys(body)).toEqual(["trigger"]);
      expect(body.trigger).toEqual({ type: "event", events: ["file.created", "pr.opened"] });
    });
  });

  it("Run now fires the trigger mutation from the top-right", async () => {
    render(<DetailScreen automationId="on-file" />);
    await userEvent.click(screen.getByTestId(AutomationDetailScreenTestId.Run));
    expect(hooks.trigger).toHaveBeenCalledWith({ params: { id: "on-file" }, body: {} });
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /automations", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
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

  describe("task automation — the CommandLine edit surface", () => {
    beforeEach(() => {
      hooks.automation = {
        data: taskAutomation,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    it("has NO top-right Save — CommandLine's own send action is the save", () => {
      render(<DetailScreen automationId="check-prs" />);
      expect(screen.queryByTestId(AutomationDetailScreenTestId.Save)).toBeNull();
    });

    it("seeds CommandLine with the stored text and @-mentioned target", () => {
      render(<DetailScreen automationId="check-prs" />);
      expect(screen.getByTestId(CommandLineTestId.Input)).toHaveValue(
        "@Builder Zkontroluj otevřené PR",
      );
    });

    it("has no project selector — this edit surface is the generic CommandLine (send-delegation), not the task-launch container (Phase 118d)", () => {
      render(<DetailScreen automationId="check-prs" />);
      expect(screen.queryByTestId("task-command-line-project-selector")).not.toBeInTheDocument();
    });

    it("saving via CommandLine issues a task-target update preserving the attachmentSetId when no new files are attached", async () => {
      const user = userEvent.setup();
      render(<DetailScreen automationId="check-prs" />);
      const input = screen.getByTestId(CommandLineTestId.Input);
      await user.clear(input);
      await user.type(input, "Zkontroluj i draft PR");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      expect(hooks.update).toHaveBeenCalledTimes(1);
      const call = hooks.update.mock.calls[0]![0];
      expect(call.params).toEqual({ id: "check-prs" });
      expect(call.body.target).toEqual({
        type: "task",
        text: "Zkontroluj i draft PR",
        target: undefined,
        attachmentSetId: "set-1",
      });
      expect(call.body.enabled).toBe(true);
      expect(call.body.trigger).toEqual({ type: "cron", expr: expect.any(String) });
    });
  });
});
