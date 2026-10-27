import type { QuickAction } from "@zibby/contracts";
import { AnchoredSheetTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../../test/render";
import { QuickActionFormTestId } from "../../widgets/QuickActionForm";
import { QuickActionSheet } from "./QuickActionSheet";

const d = vi.hoisted(() => ({ update: vi.fn() }));
const action: QuickAction = { id: "a1", label: "Deploy", text: "Run deploy" };

vi.mock("../../../automations/queries", () => ({ useAutomationsQuery: () => ({ data: [] }) }));
vi.mock("../../../quick-actions/queries", () => ({
  useQuickActionsQuery: () => ({ data: [action] }),
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

  it("renders nothing for an unknown id", () => {
    renderWithProviders(<QuickActionSheet anchor={anchor} id="gone" onClose={vi.fn()} />);
    expect(screen.queryByTestId(AnchoredSheetTestId.Root)).toBeNull();
  });
});
