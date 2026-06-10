import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewTaskDialog } from "./NewTaskDialog";

/**
 * The classifier and run endpoints are mocked so the dialog's FSM is exercised
 * end-to-end without a backend: the classify mock resolves a canned routing, and
 * the run mocks resolve immediately. The point under test is the approval gate —
 * nothing dispatches until the explicit Dispatch click.
 */
const CANNED_ROUTING = {
  status: 200,
  body: {
    target: { kind: "agent", id: "zibby", name: "ZIBBY", glyph: "bot" },
    confidence: 0.55,
    reason: "Routed to ZIBBY.",
    matchedTerms: [],
    candidates: [{ kind: "agent", id: "zibby", name: "ZIBBY", glyph: "bot" }],
  },
};

const startAgentRun = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
);

vi.mock("../mutations", () => ({
  useClassifyTaskMutation: () => ({
    mutate: (_vars: unknown, opts?: { onSuccess?: (res: typeof CANNED_ROUTING) => void }) =>
      opts?.onSuccess?.(CANNED_ROUTING),
    isPending: false,
  }),
}));

vi.mock("../../agents/mutations", () => ({
  useStartAgentRunMutation: () => ({ mutate: startAgentRun, isPending: false }),
}));

vi.mock("../../pipelines/mutations", () => ({
  useStartPipelineRunMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("NewTaskDialog", () => {
  it("renders as a labelled modal dialog on the compose step", () => {
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "NOVÝ TASK" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zařadit & spustit/ })).toBeInTheDocument();
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

  it("is approval-first: routing shows Dispatch but nothing runs until it is clicked", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await userEvent.click(screen.getByRole("button", { name: /Zařadit & spustit/ }));

    const dispatch = await screen.findByRole("button", { name: /Dispatch/ });
    expect(dispatch).toBeInTheDocument();
    expect(screen.getByText(/Nic se nespustí/)).toBeInTheDocument();
    expect(screen.queryByText("Task předán")).not.toBeInTheDocument();
    expect(startAgentRun).not.toHaveBeenCalled();

    await userEvent.click(dispatch);
    expect(startAgentRun).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Task předán")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Otevřít běhy/ })).toBeInTheDocument();
  });

  it("opens the manual override picker from the routing stage", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "udělej něco");
    await userEvent.click(screen.getByRole("button", { name: /Zařadit & spustit/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Změnit cíl/ }));
    expect(screen.getByText("Vyber cíl ručně")).toBeInTheDocument();
  });

  it("closes via the cancel action", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Zrušit/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
