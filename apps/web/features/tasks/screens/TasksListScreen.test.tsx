import { DataTableTestId, DropdownTestId, FilterBarTestId } from "@zibby/design-system";
import type { TaskParent } from "@zibby/contracts";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { TasksListScreen } from "./TasksListScreen";

const push = vi.fn();
const replace = vi.fn();
const { navState } = vi.hoisted(() => ({ navState: { search: "" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/work/tasks",
  useSearchParams: () => new URLSearchParams(navState.search),
}));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    parents: [] as TaskParent[],
    isPending: false,
    isError: false,
    companies: [] as { id: string; name: string }[],
  },
}));
const fetchNextPage = vi.fn();
const refetch = vi.fn();
const useTaskParentsInfiniteQuery = vi.fn(() => ({
  data: hooks.parents,
  isPending: hooks.isPending,
  isError: hooks.isError,
  refetch,
  fetchNextPage,
  hasNextPage: false,
  isFetchingNextPage: false,
}));

vi.mock("../queries", () => ({
  useTaskParentsInfiniteQuery: (...args: unknown[]) => useTaskParentsInfiniteQuery(...(args as [])),
}));
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: hooks.companies }) }));
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
    hooks.companies = [];
    push.mockClear();
    replace.mockClear();
    fetchNextPage.mockClear();
    navState.search = "";
    useTaskParentsInfiniteQuery.mockClear();
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

  it("seeds the company filter from ?company= (the Companies detail's All tasks link)", () => {
    navState.search = "company=co-1";
    render(<TasksListScreen />);
    expect(useTaskParentsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ company: "co-1" }),
    );
  });

  it("initializes every filter from the URL, ignoring invalid enum values", () => {
    navState.search = "company=co-1&project=p-1&department=eng&state=blocked&source=nope";
    render(<TasksListScreen />);
    expect(useTaskParentsInfiniteQuery).toHaveBeenLastCalledWith({
      company: "co-1",
      project: "p-1",
      department: "eng",
      state: "blocked",
      source: undefined,
    });
  });

  it("writes a changed filter to the URL with replace, keeping other params", async () => {
    navState.search = "foo=1";
    render(<TasksListScreen />);
    // triggers: company, project, department, state, source; options: All, thinking, working, blocked, error, done
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Trigger)[3]!);
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Option)[5]!);
    expect(replace).toHaveBeenCalledWith("/work/tasks?foo=1&state=done");
  });

  it("changing company clears project in the URL", async () => {
    navState.search = "project=p-1";
    hooks.companies = [{ id: "co-1", name: "Acme" }];
    render(<TasksListScreen />);
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Trigger)[0]!);
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Option)[1]!);
    expect(replace).toHaveBeenCalledWith("/work/tasks?company=co-1");
  });

  it("clear filters drops every filter param", async () => {
    navState.search = "state=done&source=channel";
    render(<TasksListScreen />);
    await userEvent.click(screen.getByTestId(FilterBarTestId.Clear));
    expect(replace).toHaveBeenCalledWith("/work/tasks");
  });
});
