import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { TodoWidget, TodoWidgetTestId } from "./TodoWidget";

const d = vi.hoisted(() => ({
  items: [] as unknown[],
  push: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: d.push, replace: vi.fn() }) }));
vi.mock("../../todo/queries", () => ({
  useTodoQuery: () => ({ data: { items: d.items }, isPending: false }),
}));
vi.mock("../../todo/mutations", () => ({
  useCreateTodoMutation: () => ({ mutate: d.create, isPending: false }),
  useDeleteTodoMutation: () => ({ mutate: d.remove, isPending: false }),
}));

const widget: BridgeWidget = { id: "w-todo", type: "todo", x: 0, y: 0, w: 4, h: 8 };
const props = (): BridgeWidgetProps => ({
  widget,
  editing: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  onScopeChange: vi.fn(),
});

afterEach(() => {
  vi.clearAllMocks();
  d.items = [];
});

describe("TodoWidget (interim, notes API)", () => {
  it("adds a note and never submits blank text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TodoWidget {...props()} />);
    expect(screen.getByTestId(TodoWidgetTestId.Add)).toBeDisabled();
    await user.type(screen.getByTestId(TodoWidgetTestId.Input), "Fix it");
    await user.click(screen.getByTestId(TodoWidgetTestId.Add));
    expect(d.create).toHaveBeenCalledWith({ body: { text: "Fix it" } }, expect.anything());
  });

  it("implement prefills /work/tasks/new, delete removes the note", async () => {
    d.items = [{ id: "todo_1", text: "Fix it", createdAt: "2026-10-24T10:00:00.000Z" }];
    const user = userEvent.setup();
    renderWithProviders(<TodoWidget {...props()} />);
    await user.click(screen.getByTestId(TodoWidgetTestId.Implement));
    expect(d.push).toHaveBeenCalledWith("/work/tasks/new?text=Fix+it&title=Fix+it&todo=todo_1");
    await user.click(screen.getByTestId(TodoWidgetTestId.Delete));
    expect(d.remove).toHaveBeenCalledWith({ params: { id: "todo_1" } });
  });
});
