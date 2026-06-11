import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewTaskDialog } from "./NewTaskDialog";

/**
 * The classifier and run endpoints are mocked so the dialog's flow is exercised
 * end-to-end without a backend: the classify mock resolves a canned routing and
 * the run mocks resolve immediately. The point under test is the auto-run flow —
 * one "Spustit" click classifies, dispatches AND redirects to the new run's
 * detail on the runs page, with no intermediate screen and no confirm step.
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

const CANNED_RUN = { status: 201, body: { runId: "zibby_123_42" } };

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/overview",
  useSearchParams: () => new URLSearchParams(),
}));

const startAgentRun = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (res: typeof CANNED_RUN) => void }) =>
    opts?.onSuccess?.(CANNED_RUN),
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

  it("auto-runs: one Spustit click dispatches and redirects to the run detail", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/Zadání/), "zkontroluj zálohy");
    await userEvent.click(screen.getByRole("button", { name: /Spustit/ }));

    expect(startAgentRun).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/runs?run=zibby_123_42");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the cancel action", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Zrušit/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
