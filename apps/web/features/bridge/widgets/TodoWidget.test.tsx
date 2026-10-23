import type { InboxRoadmapItem } from "@zibby/contracts";
import { BoardRowTestId, DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { BridgeWidgetProps } from "./registry";
import { TODO_TARGET_STORAGE_KEY, TodoWidget, TodoWidgetTestId } from "./TodoWidget";

const d = vi.hoisted(() => ({
  items: [] as unknown[],
  projects: [] as unknown[],
  pending: false,
  push: vi.fn(),
  create: vi.fn(),
  play: vi.fn(),
  createProjectIds: [] as string[],
  playProjectIds: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: d.push, replace: vi.fn() }),
}));
vi.mock("../../inbox/queries", () => ({
  useTodoItemsQuery: () => ({ data: { items: d.items }, isPending: d.pending }),
}));
vi.mock("../../projects/queries", () => ({
  useProjectsQuery: () => ({ data: d.projects, isPending: false }),
}));
vi.mock("../../roadmap/mutations", () => ({
  useCreateRoadmapItemMutation: (projectId: string) => {
    d.createProjectIds.push(projectId);
    return { mutate: d.create, isPending: false };
  },
  usePlayRoadmapItemMutation: (projectId: string) => {
    d.playProjectIds.push(projectId);
    return { mutate: d.play, isPending: false };
  },
}));

const widget: BridgeWidget = { id: "w-todo", type: "todo", x: 0, y: 0, w: 4, h: 8 };
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

const project = (id: string, name: string) => ({ id, name });
const item = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    projectId: "p1",
    level: "task",
    name: `Item ${id}`,
    description: "",
    source: { kind: "manual" },
    lifecycle: "todo",
    runs: [],
    dependsOn: [],
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    project: { id: "p1", name: "Shop" },
    hidden: false,
    ...over,
  }) as unknown as InboxRoadmapItem;

async function chooseTarget(name: string) {
  const target = screen.getByTestId(TodoWidgetTestId.Target);
  await userEvent.click(within(target).getByTestId(DropdownTestId.Trigger));
  const option = screen
    .getAllByTestId(DropdownTestId.Option)
    .find((o) => o.textContent?.includes(name));
  await userEvent.click(option as HTMLElement);
}

beforeEach(() => {
  d.items = [];
  d.projects = [project("p1", "Shop"), project("p2", "Blog")];
  d.pending = false;
  d.push.mockReset();
  d.create.mockReset();
  d.play.mockReset();
  d.createProjectIds = [];
  d.playProjectIds = [];
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("TodoWidget", () => {
  it("lists open manual items with state and project", () => {
    d.items = [
      item("a"),
      item("b", { lifecycle: "running", projectId: "p2", project: { id: "p2", name: "Blog" } }),
    ];
    const props = setup();
    renderWithProviders(<TodoWidget {...props} />);

    const rows = screen.getAllByTestId(BoardRowTestId.Root);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-rk", "w-todo:p1/a");
    expect(rows[0]).toHaveTextContent("Item a");
    expect(rows[0]).toHaveTextContent("K implementaci");
    expect(rows[0]).toHaveTextContent("Shop");
    expect(rows[0]).toHaveTextContent("1h");
    expect(rows[1]).toHaveTextContent("Item b");
    expect(rows[1]).toHaveTextContent("Běží");
    expect(rows[1]).toHaveTextContent("Blog");
    expect(props.onCountChange).toHaveBeenLastCalledWith({ count: 2, you: 0, loading: false });
    // Only the `todo` row offers Implement.
    expect(screen.getAllByTestId(TodoWidgetTestId.Implement)).toHaveLength(1);
  });

  it("adds an item to the chosen target on Enter", async () => {
    d.create.mockImplementation((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    renderWithProviders(<TodoWidget {...setup()} />);
    await chooseTarget("Blog");

    const input = screen.getByTestId(TodoWidgetTestId.Input);
    await userEvent.type(input, "Fix login{Enter}");

    expect(d.create).toHaveBeenCalledTimes(1);
    expect(d.create.mock.calls[0]?.[0]).toEqual({
      params: { projectId: "p2" },
      body: { level: "task", name: "Fix login" },
    });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleName("Nová položka k implementaci");
  });

  it("the Add button submits too", async () => {
    renderWithProviders(<TodoWidget {...setup()} />);
    await userEvent.type(screen.getByTestId(TodoWidgetTestId.Input), "Write docs");
    await userEvent.click(screen.getByTestId(TodoWidgetTestId.Add));
    expect(d.create.mock.calls[0]?.[0]).toEqual({
      params: { projectId: "p1" },
      body: { level: "task", name: "Write docs" },
    });
  });

  it("remembers the target project", async () => {
    const { unmount } = renderWithProviders(<TodoWidget {...setup()} />);
    await chooseTarget("Blog");
    expect(window.localStorage.getItem(TODO_TARGET_STORAGE_KEY)).toBe("p2");
    expect(TODO_TARGET_STORAGE_KEY).toBe("zibby.bridge.todo.target");
    unmount();

    renderWithProviders(<TodoWidget {...setup()} />);
    const target = screen.getByTestId(TodoWidgetTestId.Target);
    expect(within(target).getByTestId(DropdownTestId.Trigger)).toHaveTextContent("Blog");
  });

  it("falls back when the stored target is gone", async () => {
    window.localStorage.setItem(TODO_TARGET_STORAGE_KEY, "gone");
    renderWithProviders(<TodoWidget {...setup()} />);
    const target = screen.getByTestId(TodoWidgetTestId.Target);
    expect(within(target).getByTestId(DropdownTestId.Trigger)).toHaveTextContent("Shop");

    await userEvent.type(screen.getByTestId(TodoWidgetTestId.Input), "X{Enter}");
    expect(d.create.mock.calls[0]?.[0]).toMatchObject({ params: { projectId: "p1" } });
  });

  it("does not submit blank text", async () => {
    renderWithProviders(<TodoWidget {...setup()} />);
    await userEvent.type(screen.getByTestId(TodoWidgetTestId.Input), " {Enter}");
    await userEvent.click(screen.getByTestId(TodoWidgetTestId.Add));
    expect(d.create).not.toHaveBeenCalled();
  });

  it("survives a throwing localStorage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderWithProviders(<TodoWidget {...setup()} />);
    await chooseTarget("Blog");
    await userEvent.type(screen.getByTestId(TodoWidgetTestId.Input), "Fix{Enter}");
    expect(d.create.mock.calls[0]?.[0]).toEqual({
      params: { projectId: "p2" },
      body: { level: "task", name: "Fix" },
    });
  });

  it("Implement plays a todo item without navigating", async () => {
    d.items = [item("a", { projectId: "p2", project: { id: "p2", name: "Blog" } })];
    renderWithProviders(<TodoWidget {...setup()} />);

    const implement = screen.getByTestId(TodoWidgetTestId.Implement);
    expect(implement).toHaveAccessibleName("Implementovat: Item a");
    await userEvent.click(implement);

    expect(d.play).toHaveBeenCalledTimes(1);
    expect(d.play.mock.calls[0]?.[0]).toEqual({
      params: { projectId: "p2", itemId: "a" },
      body: {},
    });
    expect(d.playProjectIds).toContain("p2");
    expect(d.push).not.toHaveBeenCalled();
  });

  it("row click opens the project roadmap", async () => {
    d.items = [item("a", { lifecycle: "enqueued" })];
    renderWithProviders(<TodoWidget {...setup()} />);
    await userEvent.click(screen.getByTestId(BoardRowTestId.Root));
    expect(d.push).toHaveBeenCalledWith("/projects/p1/roadmap");
  });

  it("no projects shows the hint and collapses only without items", () => {
    d.projects = [];
    const props = setup();
    const { unmount } = renderWithProviders(<TodoWidget {...props} />);
    expect(screen.getByTestId(TodoWidgetTestId.NoProjects)).toHaveTextContent(
      "Nejdřív založ projekt",
    );
    expect(screen.queryByTestId(TodoWidgetTestId.Input)).toBeNull();
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
    unmount();

    d.items = [item("a")];
    const withItems = setup();
    renderWithProviders(<TodoWidget {...withItems} />);
    expect(withItems.onEmptyChange).toHaveBeenLastCalledWith(false);
  });

  it("is never empty while the quick-add form is available", () => {
    const props = setup();
    renderWithProviders(<TodoWidget {...props} />);
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
    expect(props.onCountChange).toHaveBeenLastCalledWith({ count: 0, you: 0, loading: false });
  });

  it("is not reported empty while the list is loading", () => {
    d.projects = [];
    d.pending = true;
    const props = setup();
    renderWithProviders(<TodoWidget {...props} />);
    expect(props.onEmptyChange).not.toHaveBeenCalledWith(true);
  });
});
