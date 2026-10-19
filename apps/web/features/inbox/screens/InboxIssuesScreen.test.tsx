import type { InboxItemsResponse, InboxRoadmapItem } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "../../../test/render";
import { ChainLinksTestId } from "../components/ChainLinks";
import { IssueRowTestId } from "../components/IssueRow";
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

describe("InboxIssuesScreen blocking chains", () => {
  const blocker = () =>
    item({
      id: "a",
      name: "Blocker",
      source: { kind: "jira", integrationId: "jira-1", externalId: "7", externalKey: "API-7" },
    });
  const blocked = () =>
    item({
      id: "b",
      name: "Blocked",
      dependsOn: ["a"],
      source: { kind: "jira", integrationId: "jira-1", externalId: "9", externalKey: "API-9" },
    });

  it("shows each row's place in the queue, linking to the other issue", () => {
    setData([blocker(), blocked()]);
    renderWithProviders(<InboxIssuesScreen />);

    const blockedRow = screen.getByTestId(`${IssueRowTestId.Root}-b`);
    const on = within(blockedRow).getByTestId(`${ChainLinksTestId.On}-a`);
    expect(on).toHaveAttribute("href", "/dashboard/inbox/issues/api/a");
    expect(on).toHaveTextContent("API-7");
    expect(on).toHaveAccessibleName(/API-7.*Blocker/);

    const blockerRow = screen.getByTestId(`${IssueRowTestId.Root}-a`);
    const by = within(blockerRow).getByTestId(`${ChainLinksTestId.By}-b`);
    expect(by).toHaveAttribute("href", "/dashboard/inbox/issues/api/b");
    expect(by).toHaveTextContent("API-9");
    expect(within(blockerRow).queryByTestId(`${ChainLinksTestId.On}-b`)).toBeNull();
  });

  it("links to a blocker hidden by the done filter", () => {
    setData([{ ...blocker(), lifecycle: "done" }, blocked()]);
    renderWithProviders(<InboxIssuesScreen />);
    expect(screen.queryByTestId(`${IssueRowTestId.Root}-a`)).toBeNull();
    expect(
      within(screen.getByTestId(`${IssueRowTestId.Root}-b`)).getByTestId(
        `${ChainLinksTestId.On}-a`,
      ),
    ).toHaveAttribute("href", "/dashboard/inbox/issues/api/a");
  });

  it("shows the chain inside an epic group", () => {
    setData([blocker(), blocked()]);
    renderWithProviders(<InboxIssuesScreen />);
    fireEvent.click(screen.getByTestId(InboxIssuesScreenTestId.GroupByEpic));
    // A search force-opens every group that still has a match.
    fireEvent.change(screen.getByTestId(InboxIssuesScreenTestId.Search), {
      target: { value: "blocked" },
    });
    expect(
      within(screen.getByTestId(`${IssueRowTestId.Root}-b`)).getByTestId(
        `${ChainLinksTestId.On}-a`,
      ),
    ).toBeInTheDocument();
  });

  it("an unblocked issue has no chain line", () => {
    setData([item({ id: "a", dependsOn: ["missing"] })]);
    renderWithProviders(<InboxIssuesScreen />);
    expect(screen.queryByTestId(ChainLinksTestId.Root)).toBeNull();
  });
});
