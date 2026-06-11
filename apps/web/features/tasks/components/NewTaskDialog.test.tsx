import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewTaskDialog } from "./NewTaskDialog";

/**
 * The create-task endpoint and limits query are mocked so the dialog's flow is
 * exercised end-to-end without a backend. `createTask` echoes the contract's
 * discriminated result: a body with a future `scheduledAt` resolves to `scheduled`
 * (the dialog confirms and stays put), everything else to `dispatched` (the dialog
 * redirects to the new run). The limits mock advertises a reset time so the
 * "when limits reset" preset is offered.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/overview",
  useSearchParams: () => new URLSearchParams(),
}));

type CreateVars = { body: { text: string; scheduledAt?: number | null } };
type CreateOpts = { onSuccess?: (res: { status: 201; body: unknown }) => void };

const createTask = vi.fn((vars: CreateVars, opts?: CreateOpts) => {
  const { scheduledAt, text } = vars.body;
  if (scheduledAt) {
    opts?.onSuccess?.({
      status: 201,
      body: {
        outcome: "scheduled",
        task: {
          id: "task_1",
          title: "",
          text,
          paths: [],
          scheduledAt,
          status: "scheduled",
          createdAt: new Date(0).toISOString(),
        },
      },
    });
  } else {
    opts?.onSuccess?.({
      status: 201,
      body: {
        outcome: "dispatched",
        runRef: "zibby_123_42",
        target: { kind: "agent", id: "zibby", name: "ZIBBY", glyph: "bot" },
      },
    });
  }
});

vi.mock("../mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: createTask, isPending: false }),
}));

const RESET_AT = Date.now() + 3 * 60 * 60 * 1000;
vi.mock("../../limits/queries/useLimitsQuery", () => ({
  useLimitsQuery: () => ({
    data: {
      rolling: { usedPct: 10, resetsAt: RESET_AT },
      weekly: { usedPct: 5, resetsAt: null },
      capturedAt: Date.now(),
      stale: false,
    },
  }),
}));

describe("NewTaskDialog", () => {
  beforeEach(() => {
    push.mockClear();
    createTask.mockClear();
  });

  it("renders as a labelled modal dialog with the composer", () => {
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Spustit/ })).toBeInTheDocument();
  });

  it("surfaces detected paths as removable context chips", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/Zadání/),
      "Srovnej média v ~/Projects/media-vault",
    );
    const remove = screen.getByRole("button", {
      name: "Odebrat cestu ~/Projects/media-vault",
    });
    expect(remove).toBeInTheDocument();
    await userEvent.click(remove);
    expect(
      screen.queryByRole("button", { name: /Odebrat cestu/ }),
    ).not.toBeInTheDocument();
  });

  it("auto-runs an immediate task: one click dispatches and redirects to the run", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await userEvent.click(screen.getByRole("button", { name: /Spustit/ }));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0]?.[0].body.scheduledAt).toBeFalsy();
    expect(push).toHaveBeenCalledWith("/runs?run=zibby_123_42");
    expect(onClose).toHaveBeenCalled();
  });

  it("schedules a delayed task: picking a preset parks it and confirms, no redirect", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");

    // Choose "In 1 h" — the submit relabels to "Schedule".
    await userEvent.click(screen.getByRole("button", { name: /Za 1 h/ }));
    await userEvent.click(screen.getByRole("button", { name: /Naplánovat/ }));

    expect(createTask).toHaveBeenCalled();
    const last = createTask.mock.calls.at(-1)?.[0];
    expect(last?.body.scheduledAt).toBeGreaterThan(Date.now());
    // No run yet → no redirect; the dialog confirms the schedule instead.
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/Task přijat/)).toBeInTheDocument();
  });

  it("closes via the cancel action", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    // Two affordances share the "Zrušit" label — the header close (X) and the
    // footer Cancel button; the footer one is the explicit cancel action.
    const cancels = screen.getAllByRole("button", { name: /Zrušit/ });
    await userEvent.click(cancels[cancels.length - 1] as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
