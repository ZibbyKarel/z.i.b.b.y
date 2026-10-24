import { BoardRowTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import { CommandLineTestId } from "../../tasks/components/CommandLine/CommandLine";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { TodoWidget, TodoWidgetTestId } from "./TodoWidget";

const d = vi.hoisted(() => ({
  items: [] as unknown[],
  pending: false,
  push: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: d.push, replace: vi.fn() }) }));
vi.mock("../../todo/queries", () => ({
  useTodoQuery: () => ({ data: { items: d.items }, isPending: d.pending }),
}));
vi.mock("../../todo/mutations", () => ({
  useCreateTodoMutation: () => ({ mutate: d.create, isPending: false }),
  useDeleteTodoMutation: () => ({ mutate: d.remove, isPending: false }),
}));
// The composer's `@` / `#` / `/` sources.
vi.mock("../../agents", () => ({
  useAgentsQuery: () => ({ data: [{ id: "koder", name: "Kodér", instructions: "x" }] }),
}));
vi.mock("../../workflows", () => ({ useWorkflowsQuery: () => ({ data: [] }) }));
vi.mock("../../departments/queries/useDepartmentsQuery", () => ({
  useDepartmentsQuery: () => ({ data: [] }),
}));
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: [{ id: "acme", name: "Acme" }] }),
}));
vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: [{ id: "zibby", name: "Zibby Web", path: "/work/zibby" }] }),
}));
vi.mock("../../skills", () => ({ useSkillsQuery: () => ({ data: [] }) }));

const widget: BridgeWidget = { id: "w-todo", type: "todo", x: 0, y: 0, w: 4, h: 8 };
const props = (over: Partial<BridgeWidgetProps> = {}): BridgeWidgetProps => ({
  widget,
  editing: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  onScopeChange: vi.fn(),
  ...over,
});

const item = (id: string, text: string) => ({ id, text, createdAt: "2026-10-24T10:00:00.000Z" });

afterEach(() => {
  vi.clearAllMocks();
  d.items = [];
  d.pending = false;
});

describe("TodoWidget", () => {
  it("renders the rows (oldest first) above the composer, with no project select", () => {
    d.items = [item("todo_1", "First"), item("todo_2", "Second")];
    renderWithProviders(<TodoWidget {...props()} />);
    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows[0]).toHaveTextContent("First");
    expect(rows[1]).toHaveTextContent("Second");
    const composer = screen.getByTestId(CommandLineTestId.Input);
    expect(rows[1]?.compareDocumentPosition(composer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByTestId(CommandLineTestId.Attach)).toBeNull();
  });

  it("adds a note with its mention tokens, and never submits blank text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TodoWidget {...props()} />);
    await user.click(screen.getByTestId(TodoWidgetTestId.Add));
    await user.type(screen.getByTestId(CommandLineTestId.Input), "   ");
    await user.click(screen.getByTestId(TodoWidgetTestId.Add));
    expect(d.create).not.toHaveBeenCalled();

    await user.clear(screen.getByTestId(CommandLineTestId.Input));
    await user.type(screen.getByTestId(CommandLineTestId.Input), "ship it @Kod");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-koder`));
    await user.type(screen.getByTestId(CommandLineTestId.Input), "for #Ac");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-company-acme`));
    await user.click(screen.getByTestId(TodoWidgetTestId.Add));
    expect(d.create).toHaveBeenCalledTimes(1);
    expect(d.create.mock.calls[0]?.[0]).toEqual({ body: { text: "ship it @Kodér for #Acme" } });
  });

  it("Delete calls DELETE for that id only and fires nothing else", async () => {
    d.items = [item("todo_1", "First"), item("todo_2", "Second")];
    const user = userEvent.setup();
    const p = props();
    renderWithProviders(<TodoWidget {...p} />);
    const second = screen.getAllByTestId(BoardRowTestId.Root)[1] as HTMLElement;
    const frame = second.closest(`[data-testid="${BoardRowTestId.Frame}"]`);
    expect(frame).not.toBeNull();
    await user.click(within(frame as HTMLElement).getByTestId(TodoWidgetTestId.Delete));
    expect(d.remove).toHaveBeenCalledTimes(1);
    expect(d.remove).toHaveBeenCalledWith({ params: { id: "todo_2" } });
    expect(d.push).not.toHaveBeenCalled();
    expect(p.onOpen).not.toHaveBeenCalled();
  });

  it("Implement pushes /work/tasks/new with text, derived title and todo id; special characters round-trip", async () => {
    const text = "Fix a&b #Zibby\nsecond line";
    d.items = [item("todo_9", text)];
    const user = userEvent.setup();
    const p = props();
    renderWithProviders(<TodoWidget {...p} />);
    await user.click(screen.getByTestId(TodoWidgetTestId.Implement));
    expect(d.push).toHaveBeenCalledTimes(1);
    const url = new URL(d.push.mock.calls[0]?.[0] as string, "http://x");
    expect(url.pathname).toBe("/work/tasks/new");
    expect(url.searchParams.get("text")).toBe(text);
    expect(url.searchParams.get("title")).toBe("Fix a&b #Zibby");
    expect(url.searchParams.get("todo")).toBe("todo_9");
    expect(d.remove).not.toHaveBeenCalled();
    expect(p.onOpen).not.toHaveBeenCalled();
  });

  it("counts the items and is never reported empty", () => {
    d.items = [item("todo_1", "A"), item("todo_2", "B")];
    const p = props();
    renderWithProviders(<TodoWidget {...p} />);
    expect(p.onCountChange).toHaveBeenLastCalledWith({ count: 2, you: 0, loading: false });
    expect(p.onEmptyChange).toHaveBeenCalledWith(false);
    expect(p.onEmptyChange).not.toHaveBeenCalledWith(true);
  });

  it("with no items the count is 0 and the composer is still there", () => {
    const p = props();
    renderWithProviders(<TodoWidget {...p} />);
    expect(p.onCountChange).toHaveBeenLastCalledWith({ count: 0, you: 0, loading: false });
    expect(p.onEmptyChange).not.toHaveBeenCalledWith(true);
    expect(screen.getByTestId(CommandLineTestId.Input)).toBeInTheDocument();
  });
});
