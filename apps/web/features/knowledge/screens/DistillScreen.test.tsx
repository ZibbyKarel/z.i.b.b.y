import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { DistillScreen } from "./DistillScreen";

const mutate = vi.fn();

vi.mock("../../automations/queries/useAutomationsQuery", () => ({
  useAutomationsQuery: () => ({
    isPending: false,
    isError: false,
    data: [
      {
        id: "memory-distill",
        name: "Noční destilace paměti",
        trigger: { type: "cron", expr: "0 2 * * *" },
        target: { type: "memory-distill" },
        enabled: true,
        system: true,
      },
      {
        id: "gap-detect",
        name: "Detekce mezer",
        trigger: { type: "cron", expr: "30 2 * * *" },
        target: { type: "gap-detect" },
        enabled: true,
        system: true,
      },
      // Not a distillation target — must be filtered out.
      {
        id: "briefing",
        trigger: { type: "cron", expr: "0 7 * * *" },
        target: { type: "briefing" },
        enabled: true,
        system: true,
      },
    ],
  }),
}));

vi.mock("../../automations/mutations/useTriggerAutomationMutation", () => ({
  useTriggerAutomationMutation: () => ({ mutate, isPending: false }),
}));

vi.mock("../components/SelfKnowledgeSection", () => ({
  SelfKnowledgeSection: () => <div data-testid="self-knowledge-stub" />,
}));

describe("DistillScreen", () => {
  it("lists only the KNW-owned distillation automations", () => {
    render(<DistillScreen />);
    expect(screen.getByText("Noční destilace paměti")).toBeInTheDocument();
    expect(screen.getByText("Detekce mezer")).toBeInTheDocument();
    expect(screen.queryByText("briefing")).not.toBeInTheDocument();
  });

  it("calls the existing trigger mutation on Run now", () => {
    render(<DistillScreen />);
    screen.getByTestId("distill-run-now").click();
    expect(mutate).toHaveBeenCalledWith(
      { params: { id: "memory-distill" }, body: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("hosts the self-model (self-knowledge) section", () => {
    render(<DistillScreen />);
    expect(screen.getByTestId("self-knowledge-stub")).toBeInTheDocument();
  });
});
