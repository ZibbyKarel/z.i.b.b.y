import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { VaultScreen } from "./VaultScreen";

const replace = vi.fn();
let noteParam: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
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
});
