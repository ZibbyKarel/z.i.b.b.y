import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automation } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { fireEvent, renderWithProviders as render, screen } from "../../test/render";
import { Screen } from "./Screen";
import { AutomationCardTestId } from "./components/AutomationCard";
import { AutomationFormTestId } from "./components/AutomationFormFields";
import { CommandLineTestId } from "../tasks/components/CommandLine/CommandLine";

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
// The create dialog (Phase 116d) renders the REAL `CommandLine` (not a stub) so
// the "@-mention an agent/pipeline, attach files, Naplánovat saves" flow is
// tested end-to-end — mirrors ChatScreen.test.tsx's own mocking pattern for the
// same component: stub every query/mutation CommandLine reads so mounting it
// never hits the network, but let the component itself run for real.
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

  it("opens the create dialog: schedule block + CommandLine, no dialog submit button", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Nová automatizace" }));
    // The trigger/schedule block (extracted TriggerFields) is present…
    expect(screen.getByText("Cron (Europe/Prague)")).toBeInTheDocument();
    // …and so is CommandLine, in its bare (chrome={false}) shape.
    expect(screen.getByTestId(CommandLineTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(CommandLineTestId.Input)).toBeInTheDocument();
    // The dialog itself owns no submit/create button any more — only CommandLine's
    // own send action (relabelled "Naplánovat") does.
    expect(screen.queryByTestId(AutomationFormTestId.Submit)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Naplánovat" })).toBeInTheDocument();
  });

  it("submitting via CommandLine's Naplánovat action creates a task-target automation", async () => {
    const user = userEvent.setup();
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Nová automatizace" }));

    await user.type(screen.getByTestId(CommandLineTestId.Input), "Zkontroluj otevřené PR");
    await user.click(screen.getByTestId(CommandLineTestId.Send));

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]![0].body;
    expect(body.name).toBe("Zkontroluj otevřené PR");
    expect(body.enabled).toBe(true);
    expect(body.trigger).toEqual({ type: "cron", expr: expect.any(String) });
    expect(body.target).toEqual({
      type: "task",
      text: "Zkontroluj otevřené PR",
      target: undefined,
      attachmentSetId: undefined,
    });
  });
});

describe("Automations Screen — system automations moved to Settings", () => {
  beforeEach(() => {
    query.automations = [automation, systemAutomation];
    query.isPending = false;
    query.isError = false;
  });

  it("excludes system automations from this page — they live in Settings → Automations now", () => {
    render(<Screen />);
    expect(screen.getByText("Ranní standup")).toBeInTheDocument();
    expect(screen.queryByText("Destilace paměti")).not.toBeInTheDocument();
  });
});
