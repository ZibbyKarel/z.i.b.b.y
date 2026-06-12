import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it, vi } from "vitest";
import { RunPrGatePanel } from "./RunPrGatePanel";

const artifact = vi.fn();
vi.mock("../queries/useRunArtifactQuery", () => ({
  useRunArtifactQuery: (_pipelineRunId: string, name: string) => artifact(name),
}));

describe("RunPrGatePanel", () => {
  it("renders the PR draft and the diffstat", () => {
    artifact.mockImplementation((name: string) =>
      name === "pr-draft.md"
        ? { data: { name, content: "# Add feature\n\n## Změny\n- feature.txt" } }
        : { data: { name, content: " feature.txt | 1 +\n 1 file changed" } },
    );
    render(<RunPrGatePanel pipelineRunId="delivery_1780000000000" />);
    expect(screen.getByText(/Add feature/)).toBeInTheDocument();
    expect(screen.getByText(/1 file changed/)).toBeInTheDocument();
  });

  it("omits a missing block (404 artifact) but still shows the present one", () => {
    artifact.mockImplementation((name: string) =>
      name === "pr-draft.md" ? { data: undefined } : { data: { name, content: "diff body here" } },
    );
    render(<RunPrGatePanel pipelineRunId="delivery_1780000000000" />);
    expect(screen.getByText(/diff body here/)).toBeInTheDocument();
    // The draft block's label is absent when its artifact 404s.
    expect(screen.queryByText("Návrh PR (pr-draft.md)")).not.toBeInTheDocument();
  });

  it("renders nothing when both artifacts are absent", () => {
    artifact.mockReturnValue({ data: undefined });
    render(<RunPrGatePanel pipelineRunId="delivery_1780000000000" />);
    // No panel chrome at all — the whole surface collapses when there's nothing to show.
    expect(screen.queryByText("Příprava PR")).not.toBeInTheDocument();
    expect(screen.queryByText("Návrh PR (pr-draft.md)")).not.toBeInTheDocument();
    expect(screen.queryByText("Změny na větvi (diffstat)")).not.toBeInTheDocument();
  });
});
