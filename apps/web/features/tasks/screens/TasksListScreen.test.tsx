import { DataTableTestId } from "@zibby/design-system";
import type { TaskParent } from "@zibby/contracts";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { TasksListScreen } from "./TasksListScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    parents: [] as TaskParent[],
    isPending: false,
    isError: false,
  },
}));
const fetchNextPage = vi.fn();
const refetch = vi.fn();

vi.mock("../queries", () => ({
  useTaskParentsInfiniteQuery: () => ({
    data: hooks.parents,
    isPending: hooks.isPending,
    isError: hooks.isError,
    refetch,
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: [] }) }));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));

function parent(overrides: Partial<TaskParent> = {}): TaskParent {
  return {
    id: "t_1",
    title: "Ship the release",
    text: "Ship the release",
    createdAt: "2020-01-01T08:00:00.000Z",
    state: "working",
    subtasks: [],
    ...overrides,
  };
}

describe("TasksListScreen (ZB-04b)", () => {
  beforeEach(() => {
    hooks.parents = [];
    hooks.isPending = false;
    hooks.isError = false;
    push.mockClear();
    fetchNextPage.mockClear();
  });

  it("renders the parent tasks table", () => {
    hooks.parents = [parent()];
    render(<TasksListScreen />);
    expect(screen.getByTestId(DataTableTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("Ship the release")).toBeInTheDocument();
  });

  it("navigates to the task detail on row click", () => {
    hooks.parents = [parent({ id: "t_42" })];
    render(<TasksListScreen />);
    fireEvent.click(screen.getByText("Ship the release"));
    expect(push).toHaveBeenCalledWith("/work/tasks/t_42");
  });

  it("shows the empty state when nothing matches", () => {
    hooks.parents = [];
    render(<TasksListScreen />);
    expect(screen.getByText("Žádný úkol neodpovídá zvoleným filtrům.")).toBeInTheDocument();
  });
});
