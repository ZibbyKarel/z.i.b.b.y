import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { GraphScreen } from "./GraphScreen";

const push = vi.fn();
const replace = vi.fn();
let source: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const query = (data: unknown) => ({ isPending: false, isError: false, fetchStatus: "idle", data });
const vault = {
  nodes: [
    { id: "moc", label: "MOC", tier: "memory" },
    { id: "k1", label: "K1", tier: "knowledge" },
  ],
  edges: [{ from: "moc", to: "k1" }],
};
const kb = { nodes: [{ id: "wiki/a.md", label: "Alpha", tier: "knowledge" }], edges: [] };

vi.mock("../mutations", () => ({
  useSyncTeamKbMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));
vi.mock("../context", () => ({
  VAULT_SOURCE: "vault",
  TEAM_SOURCE_PREFIX: "team:",
  useKnowledgeSource: () => ({
    source: source ?? "vault",
    teamId: source ? source.slice(5) : null,
    isVault: source === null,
    kbTeams: [{ id: "devrel", name: "DevRel" }],
    setSource: vi.fn(),
  }),
}));

vi.mock("../queries", () => ({
  useMemoryGraphQuery: () => query(vault),
  useTeamKbGraphQuery: (id: string | null) => query(id ? kb : undefined),
}));
describe("GraphScreen", () => {
  it("vault: filters by tier and opens a note on node click", () => {
    source = null;
    render(<GraphScreen />);
    expect(screen.getByTestId("memory-node-moc")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("graph-tier-knowledge"));
    expect(screen.queryByTestId("memory-node-moc")).toBeNull();
    fireEvent.click(screen.getByTestId("memory-node-k1"));
    expect(push).toHaveBeenCalledWith("/knowledge/vault?note=k1");
  });

  it("team source: no tier chips; a node click opens that note in the Trezor for the same team", () => {
    source = "team:devrel";
    render(<GraphScreen />);
    expect(screen.queryByTestId("graph-tier-all")).toBeNull();
    fireEvent.click(screen.getByTestId("memory-node-wiki/a.md"));
    expect(push).toHaveBeenLastCalledWith("/knowledge/vault?source=team%3Adevrel&note=wiki%2Fa.md");
  });

  it("renders the shared source bar", () => {
    source = "team:devrel";
    render(<GraphScreen />);
    expect(screen.getByTestId("knowledge-sync")).toBeInTheDocument();
  });
});
