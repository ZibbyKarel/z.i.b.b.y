import type { InboxItemsResponse, InboxRoadmapItem } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import { InboxOverviewScreen, InboxOverviewScreenTestId } from "./InboxOverviewScreen";

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

describe("InboxOverviewScreen issue rows", () => {
  it("shows the Jira status instead of the ZIBBY new label per row", () => {
    setData([item({ id: "a", sourceStatus: { name: "To Do", done: false } })]);
    renderWithProviders(<InboxOverviewScreen />);
    const row = screen.getByTestId(`${InboxOverviewScreenTestId.Issues}-a`);
    expect(within(row).getByText("To Do")).toBeInTheDocument();
    expect(within(row).queryByText("Nové ve zdroji")).toBeNull();
  });

  it("renders no label for a new item without a source status", () => {
    setData([item({ id: "a" })]);
    renderWithProviders(<InboxOverviewScreen />);
    const row = screen.getByTestId(`${InboxOverviewScreenTestId.Issues}-a`);
    expect(within(row).queryByText("Nové ve zdroji")).toBeNull();
  });

  it("keeps the ZIBBY label for a waiting item", () => {
    setData([item({ id: "a", lifecycle: "failed" })]);
    renderWithProviders(<InboxOverviewScreen />);
    const row = screen.getByTestId(`${InboxOverviewScreenTestId.Issues}-a`);
    expect(within(row).getByText("Čeká na vás")).toBeInTheDocument();
  });
});
