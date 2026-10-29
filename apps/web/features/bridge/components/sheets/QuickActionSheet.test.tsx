import type { QuickAction } from "@zibby/contracts";
import { AnchoredSheetTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../../test/render";
import { QuickActionFormTestId } from "../../widgets/QuickActionForm";
import { QuickActionSheet } from "./QuickActionSheet";

const d = vi.hoisted(() => ({ update: vi.fn() }));
const action: QuickAction = { id: "a1", label: "Deploy", text: "Run deploy" };
const immediateAction: QuickAction = { id: "a2", label: "Now", text: "go", immediate: true };

vi.mock("../../../automations/queries", () => ({ useAutomationsQuery: () => ({ data: [] }) }));
vi.mock("../../../quick-actions/queries", () => ({
  useQuickActionsQuery: () => ({ data: [action, immediateAction] }),
}));
vi.mock("../../../quick-actions/useUpdateQuickActions", () => ({
  useUpdateQuickActions: () => ({ update: d.update, pending: false }),
}));
vi.mock("../../../agents/queries", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../../../workflows/queries", () => ({ useWorkflowsQuery: () => ({ data: [] }) }));
vi.mock("../../../tasks/components/CommandLine/CommandLine", () => ({
  CommandLine: ({ initialText }: { initialText?: string }) => (
    <textarea readOnly data-testid="cl-input" defaultValue={initialText} />
  ),
}));

const anchor = {
  left: 0,
  width: 400,
  top: 0,
  height: 400,
  eL: 0,
  eT: 0,
  eH: 0,
  side: "r",
} as never;

describe("QuickActionSheet", () => {
  it("shows the action and swaps to a prefilled form on Edit", async () => {
    renderWithProviders(<QuickActionSheet anchor={anchor} id="a1" onClose={vi.fn()} />);
    expect(screen.getByTestId(AnchoredSheetTestId.Title)).toHaveTextContent("Deploy");
    expect(screen.queryByTestId(QuickActionFormTestId.Form)).toBeNull();

    await userEvent.click(
      within(screen.getByTestId(AnchoredSheetTestId.Actions)).getByRole("button"),
    );
    expect(screen.getByTestId(QuickActionFormTestId.Label)).toHaveValue("Deploy");
    expect(screen.getByTestId("cl-input")).toHaveValue("Run deploy");
  });

  it("edit pre-checks Run immediately and unchecking drops it from the save", async () => {
    renderWithProviders(<QuickActionSheet anchor={anchor} id="a2" onClose={vi.fn()} />);
    await userEvent.click(
      within(screen.getByTestId(AnchoredSheetTestId.Actions)).getByRole("button"),
    );
    const box = screen.getByTestId(QuickActionFormTestId.Immediate);
    expect(box).toHaveAttribute("aria-checked", "true");
    await userEvent.click(box);
    await userEvent.click(screen.getByTestId(QuickActionFormTestId.Submit));
    const next = (d.update.mock.calls[0]?.[0] as (l: QuickAction[]) => QuickAction[])([
      immediateAction,
    ]);
    expect("immediate" in (next[0] as object)).toBe(false);
  });

  it("renders nothing for an unknown id", () => {
    renderWithProviders(<QuickActionSheet anchor={anchor} id="gone" onClose={vi.fn()} />);
    expect(screen.queryByTestId(AnchoredSheetTestId.Root)).toBeNull();
  });
});
