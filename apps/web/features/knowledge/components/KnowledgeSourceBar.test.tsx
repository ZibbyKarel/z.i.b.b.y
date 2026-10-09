import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { KnowledgeSourceBar } from "./KnowledgeSourceBar";

const mutate = vi.fn();
const reset = vi.fn();
const setSource = vi.fn();
let syncState: Record<string, unknown> = {};
let teamId: string | null = null;

vi.mock("../mutations", () => ({
  useSyncTeamKbMutation: () => ({ mutate, reset, isPending: false, ...syncState }),
}));
vi.mock("../context", () => ({
  VAULT_SOURCE: "vault",
  TEAM_SOURCE_PREFIX: "team:",
  useKnowledgeSource: () => ({
    source: teamId ? `team:${teamId}` : "vault",
    teamId,
    isVault: teamId === null,
    kbTeams: [{ id: "devrel", name: "DevRel" }],
    setSource,
  }),
}));

describe("KnowledgeSourceBar", () => {
  it("shows the sync button only for a team source and calls the mutation", () => {
    teamId = null;
    const a = render(<KnowledgeSourceBar />);
    expect(screen.queryByTestId("knowledge-sync")).toBeNull();
    a.unmount();
    teamId = "devrel";
    render(<KnowledgeSourceBar />);
    fireEvent.click(screen.getByTestId("knowledge-sync"));
    expect(mutate).toHaveBeenCalledWith({ params: { id: "devrel" }, body: undefined });
  });

  it("switches source (and clears the sync result)", () => {
    teamId = null;
    render(<KnowledgeSourceBar />);
    fireEvent.click(screen.getByText("DevRel"));
    expect(reset).toHaveBeenCalled();
    expect(setSource).toHaveBeenCalledWith("team:devrel");
  });

  it("disables while pending and shows the result or the server error", () => {
    teamId = "devrel";
    syncState = { isPending: true };
    const a = render(<KnowledgeSourceBar />);
    expect(screen.getByTestId("knowledge-sync")).toBeDisabled();
    a.unmount();

    syncState = {
      data: { status: 200, body: { updated: true, before: "abc123", after: "def456" } },
    };
    const b = render(<KnowledgeSourceBar />);
    expect(screen.getByTestId("knowledge-sync-result")).toHaveTextContent(/abc123.*def456/);
    b.unmount();

    syncState = { isError: true, error: { status: 409, body: { message: "diverged" } } };
    render(<KnowledgeSourceBar />);
    expect(screen.getByTestId("knowledge-sync-result")).toHaveTextContent("diverged");
    syncState = {};
  });
});
