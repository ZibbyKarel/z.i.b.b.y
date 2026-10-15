import type { InboxItemsResponse, InboxRoadmapItem } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { InboxIssuesScreen, InboxIssuesScreenTestId } from "./InboxIssuesScreen";

const { hooks } = vi.hoisted(() => ({
  hooks: { data: undefined as unknown },
}));
vi.mock("../queries", () => ({
  useInboxItemsQuery: () => ({
    data: hooks.data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useInboxPrsQuery: () => ({
    data: { prs: [], errors: [] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../useInboxItemActions", () => ({
  useInboxItemActions: () => ({
    process: vi.fn(),
    isProcessing: () => false,
    toggleHidden: vi.fn(),
  }),
}));
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: [] }) }));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));

function item(over: Partial<InboxRoadmapItem>): InboxRoadmapItem {
  return {
    id: "i1",
    projectId: "api",
    level: "task",
    name: "Retry webhook deliveries",
    description: "",
    source: { kind: "jira", integrationId: "jira-1", externalId: "1", externalKey: "API-1" },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    project: { id: "api", name: "api" },
    hidden: false,
    ...over,
  };
}

function setData(items: InboxRoadmapItem[]) {
  hooks.data = {
    items,
    epics: [],
    syncProjectIds: ["api"],
    errors: [],
  } satisfies InboxItemsResponse;
}

describe("InboxIssuesScreen", () => {
  it("lists active items and hides done ones until asked", () => {
    setData([
      item({ id: "a", name: "Alpha task" }),
      item({ id: "b", name: "Bravo done", lifecycle: "done" }),
    ]);
    renderWithProviders(<InboxIssuesScreen />);
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    expect(screen.queryByText("Bravo done")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(InboxIssuesScreenTestId.ShowDone));
    expect(screen.getByText("Bravo done")).toBeInTheDocument();
  });

  it("filters by search ignoring diacritics", () => {
    setData([item({ id: "a", name: "Přihlášení" }), item({ id: "b", name: "Other thing" })]);
    renderWithProviders(<InboxIssuesScreen />);
    fireEvent.change(screen.getByTestId(InboxIssuesScreenTestId.Search), {
      target: { value: "prihlaseni" },
    });
    expect(screen.getByText("Přihlášení")).toBeInTheDocument();
    expect(screen.queryByText("Other thing")).not.toBeInTheDocument();
  });

  it("shows a 'No epic' group when grouped by epic", () => {
    setData([item({ id: "a", name: "Loose item" })]);
    renderWithProviders(<InboxIssuesScreen />);
    fireEvent.click(screen.getByTestId(InboxIssuesScreenTestId.GroupByEpic));
    expect(screen.getByText("Bez epiku")).toBeInTheDocument();
  });
});
