import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automation } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render, screen } from "../../test/render";
import { AutomationDetailScreenTestId, DetailScreen } from "./DetailScreen";
import { MarkdownEditorTestId } from "@zibby/design-system";

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
    it("Save persists the schedule + name/description — the retired target picker never comes back", async () => {
      render(<DetailScreen automationId="on-file" />);
      await userEvent.click(screen.getByTestId(AutomationDetailScreenTestId.Save));
      expect(hooks.update).toHaveBeenCalledTimes(1);
      const body = hooks.update.mock.calls[0]![0].body;
      expect(Object.keys(body)).toEqual(["trigger", "name", "description"]);
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
    expect(push).toHaveBeenCalledWith("/work/automations");
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

  describe("task automation — the Markdown edit surface", () => {
    beforeEach(() => {
      hooks.automation = {
        data: taskAutomation,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    it("seeds the Markdown editor with the stored text", () => {
      render(<DetailScreen automationId="check-prs" />);
      expect(screen.getByTestId(MarkdownEditorTestId.Control)).toHaveValue(
        "Zkontroluj otevřené PR",
      );
    });

    it("Save persists the edited Markdown, keeping target + attachmentSetId, and the text stays in the editor", async () => {
      const user = userEvent.setup();
      render(<DetailScreen automationId="check-prs" />);
      const input = screen.getByTestId(MarkdownEditorTestId.Control);
      await user.clear(input);
      await user.type(input, "## Zkontroluj i draft PR");
      await user.click(screen.getByTestId(AutomationDetailScreenTestId.Save));

      expect(hooks.update).toHaveBeenCalledTimes(1);
      const call = hooks.update.mock.calls[0]![0];
      expect(call.params).toEqual({ id: "check-prs" });
      expect(call.body.target).toEqual({
        ...taskAutomation.target,
        text: "## Zkontroluj i draft PR",
      });
      expect(call.body.enabled).toBe(true);
      expect(call.body.trigger).toEqual({ type: "cron", expr: expect.any(String) });
      expect(screen.getByTestId(MarkdownEditorTestId.Control)).toHaveValue(
        "## Zkontroluj i draft PR",
      );
    });

    it("saves the edited name + description alongside the text", async () => {
      const user = userEvent.setup();
      render(<DetailScreen automationId="check-prs" />);
      const name = screen.getByTestId(AutomationDetailScreenTestId.Name);
      await user.clear(name);
      await user.type(name, "Revize PR");
      await user.type(screen.getByTestId(AutomationDetailScreenTestId.Description), "Denní revize");
      await user.click(screen.getByTestId(AutomationDetailScreenTestId.Save));

      const call = hooks.update.mock.calls[0]![0];
      expect(call.body.name).toBe("Revize PR");
      expect(call.body.description).toBe("Denní revize");
    });
  });
});
