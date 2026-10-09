import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { GraphScreen } from "./GraphScreen";

const push = vi.fn();
const replace = vi.fn();
let source: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/knowledge/graph",
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    return params;
  },
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

vi.mock("../queries", () => ({
  useMemoryGraphQuery: () => query(vault),
  useTeamKbGraphQuery: (id: string | null) => query(id ? kb : undefined),
}));
vi.mock("../../teams/queries", () => ({
  useTeamsQuery: () => ({
    data: [
      { id: "devrel", name: "DevRel", knowledgeBase: { kind: "vault", path: "/x" } },
      { id: "nokb", name: "NoKb" },
    ],
  }),
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

  it("team source: shows the KB graph read-only (path, no tier chips) and lists only KB teams", () => {
    source = "team:devrel";
    render(<GraphScreen />);
    expect(screen.queryByTestId("graph-tier-all")).toBeNull();
    expect(screen.queryByText("NoKb")).toBeNull();
    fireEvent.click(screen.getByTestId("memory-node-wiki/a.md"));
    expect(screen.getByText(/wiki\/a\.md/)).toBeInTheDocument();
    expect(push).toHaveBeenCalledTimes(1);
  });
});
