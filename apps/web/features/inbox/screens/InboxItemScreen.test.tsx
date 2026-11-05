import type { InboxItemsResponse, InboxRoadmapItem } from "@zibby/contracts";
import { CopyableTextTestId } from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { InboxItemScreen, InboxItemScreenTestId } from "./InboxItemScreen";

const { hooks, process, push } = vi.hoisted(() => ({
  hooks: { data: undefined as unknown },
  process: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
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
    process,
    isProcessing: () => false,
    toggleHidden: vi.fn(),
  }),
}));
vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: [{ id: "acme", name: "Acme" }] }),
}));
vi.mock("../../teams", () => ({
  useTeamsQuery: () => ({ data: [{ id: "core", name: "Core team" }] }),
}));

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
    project: { id: "api", name: "API platform" },
    hidden: false,
    ...over,
  };
}

function setData(items: InboxRoadmapItem[], epics: InboxItemsResponse["epics"] = []) {
  hooks.data = { items, epics, syncProjectIds: ["api"], errors: [] } satisfies InboxItemsResponse;
}

describe("InboxItemScreen meta panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the issue key with a copy button that copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setData([item({})]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);
    expect(screen.getByTestId(CopyableTextTestId.Text)).toHaveTextContent("API-1");
    fireEvent.click(screen.getByTestId(CopyableTextTestId.Copy));
    expect(writeText).toHaveBeenCalledWith("API-1");
  });

  it("links project, company and team names to their detail pages", () => {
    setData([item({ companyId: "acme", teamId: "core" })]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);

    const project = screen.getByTestId(InboxItemScreenTestId.MetaProject);
    expect(project).toHaveAttribute("href", "/projects/api");
    expect(project).toHaveTextContent("API platform");

    const company = screen.getByTestId(InboxItemScreenTestId.MetaCompany);
    expect(company).toHaveAttribute("href", "/companies/acme");
    expect(company).toHaveTextContent("Acme");
    expect(company).not.toHaveAttribute("target");

    const team = screen.getByTestId(InboxItemScreenTestId.MetaTeam);
    expect(team).toHaveAttribute("href", "/teams/core");
    expect(team).toHaveTextContent("Core team");
  });

  it("renders plain text when company/team id does not resolve", () => {
    setData([item({ companyId: "gone" })]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);

    expect(screen.queryByTestId(InboxItemScreenTestId.MetaCompany)).not.toBeInTheDocument();
    expect(screen.queryByTestId(InboxItemScreenTestId.MetaTeam)).not.toBeInTheDocument();
    const meta = screen.getByTestId(InboxItemScreenTestId.Meta);
    expect(meta).toHaveTextContent("Bez firmy");
    expect(meta).toHaveTextContent("Bez týmu");
  });

  it("does not show Source or Epic rows, even for an item under an epic", () => {
    setData(
      [item({ parentId: "e1" })],
      [
        {
          id: "e1",
          projectId: "api",
          key: "API-0",
          title: "Big epic",
          source: "jira",
          done: 0,
          total: 1,
        },
      ],
    );
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);

    const meta = screen.getByTestId(InboxItemScreenTestId.Meta);
    expect(meta).not.toHaveTextContent("Epik");
    expect(meta).not.toHaveTextContent("Big epic");
    expect(meta).not.toHaveTextContent("Zdroj");
  });
});

describe("InboxItemScreen source status", () => {
  it("shows no ZIBBY status tag for a new item", () => {
    setData([item({ sourceStatus: { name: "To Do", done: false } })]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);
    expect(screen.getByTestId(InboxItemScreenTestId.Status)).toHaveTextContent("To Do");
    expect(screen.queryByTestId("inbox-zibby-status-new")).toBeNull();
  });

  it("shows no ZIBBY status tag for a running item", () => {
    setData([
      item({
        lifecycle: "running",
        sourceStatus: { name: "In Progress", done: false },
      }),
    ]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);
    expect(screen.queryByTestId("inbox-zibby-status-running")).toBeNull();
  });

  it("keeps the ZIBBY tag for a done item", () => {
    setData([item({ lifecycle: "done" })]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);
    expect(screen.getByTestId("inbox-zibby-status-done")).toBeInTheDocument();
  });
});

describe("InboxItemScreen title", () => {
  it("links to the source in a new tab when it has a url", () => {
    setData([item({ source: { ...item({}).source, url: "https://jira.test/API-1" } })]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);
    const title = screen.getByTestId(InboxItemScreenTestId.Title);
    expect(title).toHaveAttribute("href", "https://jira.test/API-1");
    expect(title).toHaveAttribute("target", "_blank");
  });

  it("is plain text without a source url", () => {
    setData([item({})]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);
    expect(screen.getByTestId(InboxItemScreenTestId.Title)).not.toHaveAttribute("href");
  });
});

describe("InboxItemScreen process", () => {
  it("opens the new-task page linked to the issue instead of processing immediately (TODO 7)", () => {
    setData([item({})]);
    renderWithProviders(<InboxItemScreen itemId="i1" projectId="api" />);
    fireEvent.click(screen.getByTestId(InboxItemScreenTestId.Process));
    expect(push).toHaveBeenCalledWith("/work/tasks/new?issue=api%2Fi1");
    expect(process).not.toHaveBeenCalled();
  });
});
