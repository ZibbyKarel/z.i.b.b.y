import type { QuickAction } from "@zibby/contracts";
import { BoardRowTestId, DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { QuickActionsWidget, QuickActionsWidgetTestId } from "./QuickActionsWidget";

const d = vi.hoisted(() => ({
  actions: [] as unknown[],
  pending: false,
  createPending: false,
  create: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../../quick-actions/queries", () => ({
  useQuickActionsQuery: () => ({ data: d.actions, isPending: d.pending }),
}));
vi.mock("../../quick-actions/mutations", () => ({
  useSetQuickActionsMutation: () => ({ mutate: d.set, isPending: false }),
}));
vi.mock("../../tasks/mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: d.create, isPending: d.createPending }),
}));
vi.mock("../../agents/queries", () => ({
  useAgentsQuery: () => ({ data: [{ id: "coder", name: "Kodér" }] }),
}));
vi.mock("../../workflows/queries", () => ({
  useWorkflowsQuery: () => ({ data: [{ id: "ship", name: "Ship it" }] }),
}));

const widget: BridgeWidget = { id: "w-qa", type: "quickActions", x: 0, y: 0, w: 4, h: 8 };
const setup = (over: Partial<BridgeWidgetProps> = {}): BridgeWidgetProps => ({
  widget,
  editing: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  ...over,
});

const KODER = { kind: "agent", id: "coder", name: "Kodér" } as const;
const deploy: QuickAction = { id: "a1", label: "Deploy", text: "Run deploy", target: KODER };
const lint: QuickAction = { id: "a2", label: "Lint", text: "Run lint" };

beforeEach(() => {
  d.actions = [deploy, lint];
  d.pending = false;
  d.createPending = false;
  d.create.mockReset();
  d.set.mockReset();
});

describe("QuickActionsWidget", () => {
  it("lists actions with target name or Auto", () => {
    renderWithProviders(<QuickActionsWidget {...setup()} />);
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Deploy");
    expect(rows[0]).toHaveTextContent("Kodér");
    expect(rows[1]).toHaveTextContent("Lint");
    expect(rows[1]).toHaveTextContent("Automaticky");
  });

  it("Run enqueues the task with the stored target", async () => {
    renderWithProviders(<QuickActionsWidget {...setup()} />);
    await userEvent.click(screen.getAllByTestId(QuickActionsWidgetTestId.Run)[0] as HTMLElement);
    expect(d.create.mock.calls[0]?.[0]).toEqual({
      body: { title: "Deploy", text: "Run deploy", target: KODER },
    });
  });

  it("Run without target sends no target key", async () => {
    renderWithProviders(<QuickActionsWidget {...setup()} />);
    await userEvent.click(screen.getAllByTestId(QuickActionsWidgetTestId.Run)[1] as HTMLElement);
    const body = d.create.mock.calls[0]?.[0].body as object;
    expect("target" in body).toBe(false);
  });

  it("Run is disabled while pending", () => {
    d.createPending = true;
    renderWithProviders(<QuickActionsWidget {...setup()} />);
    for (const b of screen.getAllByTestId(QuickActionsWidgetTestId.Run)) expect(b).toBeDisabled();
  });

  it("shows Queued after a successful run", async () => {
    d.create.mockImplementation((_v, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    renderWithProviders(<QuickActionsWidget {...setup()} />);
    await userEvent.click(screen.getAllByTestId(QuickActionsWidgetTestId.Run)[0] as HTMLElement);
    expect(screen.getAllByTestId(BoardRowTestId.Root)[0]).toHaveTextContent("Zařazeno do fronty");
  });

  it("not editing: no add form and no remove", () => {
    renderWithProviders(<QuickActionsWidget {...setup()} />);
    expect(screen.queryByTestId(QuickActionsWidgetTestId.Add)).toBeNull();
    expect(screen.queryByTestId(QuickActionsWidgetTestId.Remove)).toBeNull();
  });

  it("editing: Remove drops only that action", async () => {
    d.actions = [deploy, lint, { id: "a3", label: "Test", text: "t" }];
    renderWithProviders(<QuickActionsWidget {...setup({ editing: true })} />);
    await userEvent.click(screen.getAllByTestId(QuickActionsWidgetTestId.Remove)[1] as HTMLElement);
    expect(d.set.mock.calls[0]?.[0]).toEqual({
      body: [deploy, { id: "a3", label: "Test", text: "t" }],
    });
  });

  it("editing: Add appends a trimmed action with the chosen target", async () => {
    renderWithProviders(<QuickActionsWidget {...setup({ editing: true })} />);
    await userEvent.type(screen.getByTestId(QuickActionsWidgetTestId.Label), " Deploy ");
    await userEvent.type(screen.getByTestId(QuickActionsWidgetTestId.Text), " Run deploy ");
    const target = screen.getByTestId(QuickActionsWidgetTestId.Target);
    await userEvent.click(within(target).getByTestId(DropdownTestId.Trigger));
    const option = screen
      .getAllByTestId(DropdownTestId.Option)
      .find((o) => o.textContent?.includes("Kodér"));
    await userEvent.click(option as HTMLElement);
    await userEvent.click(screen.getByTestId(QuickActionsWidgetTestId.Add));

    const body = d.set.mock.calls[0]?.[0].body as QuickAction[];
    expect(body).toHaveLength(3);
    expect(body[2]).toMatchObject({ label: "Deploy", text: "Run deploy", target: KODER });
    expect(body[2]?.id).toMatch(/^qa-/);
  });

  it("editing: blank label or text disables Add", async () => {
    renderWithProviders(<QuickActionsWidget {...setup({ editing: true })} />);
    await userEvent.type(screen.getByTestId(QuickActionsWidgetTestId.Label), "  ");
    await userEvent.type(screen.getByTestId(QuickActionsWidgetTestId.Text), "something");
    expect(screen.getByTestId(QuickActionsWidgetTestId.Add)).toBeDisabled();
    await userEvent.type(screen.getByTestId(QuickActionsWidgetTestId.Text), "{Enter}");
    expect(d.set).not.toHaveBeenCalled();
  });

  it("reports empty with no actions", () => {
    d.actions = [];
    const empty = setup();
    const { unmount } = renderWithProviders(<QuickActionsWidget {...empty} />);
    expect(empty.onEmptyChange).toHaveBeenLastCalledWith(true);
    unmount();
    d.actions = [lint];
    const one = setup();
    renderWithProviders(<QuickActionsWidget {...one} />);
    expect(one.onEmptyChange).toHaveBeenLastCalledWith(false);
  });
});
