import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { VaultScreen } from "./VaultScreen";

const replace = vi.fn();
let noteParam: string | null = null;
let teamId: string | null = null;

vi.mock("../context", () => ({
  VAULT_SOURCE: "vault",
  TEAM_SOURCE_PREFIX: "team:",
  useKnowledgeSource: () => ({
    source: teamId ? `team:${teamId}` : "vault",
    teamId,
    isVault: teamId === null,
    kbTeams: [{ id: "devrel", name: "DevRel" }],
    setSource: vi.fn(),
  }),
}));

const teamNotes = [
  { id: "wiki/alpha.md", title: "Alpha", folder: "wiki" },
  { id: "wiki/beta.md", title: "Beta", folder: "wiki" },
  { id: "team-context.md", title: "Team Context", folder: "" },
];
vi.mock("../queries/useTeamKbNotesQuery", () => ({
  useTeamKbNotesQuery: (id: string | null) => ({
    isPending: false,
    isError: false,
    data: id ? teamNotes : undefined,
  }),
}));
vi.mock("../queries/useTeamKbNoteQuery", () => ({
  useTeamKbNoteQuery: (_id: string | null, path: string | null) => ({
    isError: false,
    data:
      path === "wiki/alpha.md"
        ? { id: "wiki/alpha.md", title: "Alpha", body: "Alpha body", links: ["beta", "ghost"] }
        : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/knowledge/vault",
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (noteParam) params.set("note", noteParam);
    return params;
  },
}));

vi.mock("../queries/useMemoryGraphQuery", () => ({
  useMemoryGraphQuery: () => ({
    isPending: false,
    isError: false,
    data: {
      nodes: [
        { id: "moc", label: "MOC", tier: "memory" },
        { id: "dev-note", label: "Dev shelf note", tier: "knowledge", department: "dev" },
      ],
      edges: [],
    },
  }),
}));

vi.mock("../queries/useMemorySearchQuery", () => ({
  useMemorySearchQuery: () => ({ data: { results: [] } }),
}));

vi.mock("../queries/useNoteQuery", () => ({
  useNoteQuery: (id: string | null) =>
    id === "dev-note"
      ? {
          data: {
            id: "dev-note",
            path: "knowledge/dev-note.md",
            tier: "knowledge",
            title: "Dev shelf note",
            frontmatter: {},
            links: [],
            backlinks: ["moc"],
          },
        }
      : { data: undefined },
}));

describe("VaultScreen", () => {
  it("lists the seeded notes grouped by tier → department shelf", () => {
    render(<VaultScreen />);
    expect(screen.getByTestId("list-item-memory-general-moc")).toBeInTheDocument();
    expect(screen.getByTestId("list-item-knowledge-dev-dev-note")).toBeInTheDocument();
  });

  it("shows the open note's backlinks in the used-by rail", () => {
    noteParam = "dev-note";
    render(<VaultScreen />);
    expect(screen.getByTestId("vault-usedby-moc")).toBeInTheDocument();
    noteParam = null;
  });

  it("vault source keeps the editing actions", () => {
    teamId = null;
    render(<VaultScreen />);
    expect(screen.getByTestId("vault-note-new")).toBeInTheDocument();
    expect(screen.getByTestId("vault-import-open")).toBeInTheDocument();
    expect(screen.getByTestId("vault-quickcapture-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("knowledge-sync")).toBeNull();
  });

  describe("team source", () => {
    it("lists the KB notes by folder, filters, and offers sync — but no edit actions", () => {
      teamId = "devrel";
      render(<VaultScreen />);
      expect(screen.getByTestId("list-item-kb-wiki/alpha.md")).toBeInTheDocument();
      expect(screen.getByTestId("list-item-kb-team-context.md")).toBeInTheDocument();
      expect(screen.getByTestId("knowledge-sync")).toBeInTheDocument();
      for (const id of ["vault-note-new", "vault-import-open", "vault-quickcapture-toggle"]) {
        expect(screen.queryByTestId(id)).toBeNull();
      }
      fireEvent.change(screen.getByTestId("vault-search-input"), { target: { value: "beta" } });
      expect(screen.queryByTestId("list-item-kb-wiki/alpha.md")).toBeNull();
      expect(screen.getByTestId("list-item-kb-wiki/beta.md")).toBeInTheDocument();
    });

    it("opens a note by click (note param) and renders it read-only with resolved links", () => {
      teamId = "devrel";
      noteParam = null;
      render(<VaultScreen />);
      fireEvent.click(screen.getByTestId("list-item-kb-wiki/alpha.md"));
      expect(replace).toHaveBeenLastCalledWith("/knowledge/vault?note=wiki%2Falpha.md", {
        scroll: false,
      });
    });

    it("shows the open note without an Edit action; only resolvable wikilinks become chips", () => {
      teamId = "devrel";
      noteParam = "wiki/alpha.md";
      render(<VaultScreen />);
      expect(screen.getByText("Alpha body")).toBeInTheDocument();
      expect(screen.queryByTestId("memory-note-edit")).toBeNull();
      expect(screen.getByTestId("memory-note-link-wiki/beta.md")).toBeInTheDocument();
      expect(screen.queryByTestId("memory-note-link-ghost")).toBeNull();
      fireEvent.click(screen.getByTestId("memory-note-link-wiki/beta.md"));
      expect(replace).toHaveBeenLastCalledWith("/knowledge/vault?note=wiki%2Fbeta.md", {
        scroll: false,
      });
      teamId = null;
      noteParam = null;
    });
  });
});
