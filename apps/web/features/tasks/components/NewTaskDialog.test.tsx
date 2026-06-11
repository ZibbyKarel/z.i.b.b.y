import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewTaskDialog } from "./NewTaskDialog";

/**
 * The classifier and run endpoints are mocked so the dialog's FSM is exercised
 * end-to-end without a backend: the classify mock resolves a canned routing and
 * the run mocks resolve immediately. The point under test is the auto-run flow —
 * one "Spustit" click classifies AND dispatches, with no confirm step between.
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

  it("auto-runs: one Spustit click classifies and dispatches with no confirm step", async () => {
    render(<NewTaskDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await userEvent.click(screen.getByRole("button", { name: /Spustit/ }));

    expect(startAgentRun).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Task předán")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Otevřít běhy/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dispatch/ })).not.toBeInTheDocument();
  });

  it("closes via the cancel action", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Zrušit/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
