import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Integration, ProjectPr, ResolvedProjectContext } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import {
  ProjectPrCountBadge,
  ProjectPrCountBadgeTestId,
  ProjectPullRequestsPanel,
  ProjectPullRequestsPanelTestId,
} from "./ProjectPullRequestsPanel";

const GITHUB_INTEGRATION: Integration = {
  id: "acme-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"] },
};

const pr = (over: Partial<ProjectPr> = {}): ProjectPr => ({
  number: 42,
  title: "Fix flaky test",
  url: "https://github.com/acme/app/pull/42",
  author: "alice",
  branch: "fix/flaky-test",
  draft: false,
  ...over,
});

let prsData: ProjectPr[] = [];
let resolvedData: ResolvedProjectContext = { people: [], integrations: [GITHUB_INTEGRATION] };
const mergeMutate = vi.fn();

vi.mock("../queries", () => ({
  useProjectPrsQuery: () => ({ data: prsData }),
  useResolvedProjectQuery: () => ({ data: resolvedData }),
}));

vi.mock("../mutations", () => ({
  useMergeProjectPrMutation: () => ({ mutate: mergeMutate, isPending: false }),
}));

describe("ProjectPullRequestsPanel", () => {
  it("shows the empty state (github linked, no open PRs)", () => {
    prsData = [];
    resolvedData = { people: [], integrations: [GITHUB_INTEGRATION] };
    render(<ProjectPullRequestsPanel projectId="acme" />);
    expect(screen.getByTestId(ProjectPullRequestsPanelTestId.Empty)).toHaveTextContent(
      "Žádné otevřené PR.",
    );
  });

  it("shows the no-github state when the project has no github integration", () => {
    prsData = [];
    resolvedData = { people: [], integrations: [] };
    render(<ProjectPullRequestsPanel projectId="acme" />);
    expect(screen.getByTestId(ProjectPullRequestsPanelTestId.Empty)).toHaveTextContent(
      "Projekt nemá napojený GitHub.",
    );
  });

  it("renders a row per open PR with number, title, author and branch", () => {
    prsData = [pr()];
    resolvedData = { people: [], integrations: [GITHUB_INTEGRATION] };
    render(<ProjectPullRequestsPanel projectId="acme" />);
    const row = screen.getByTestId(ProjectPullRequestsPanelTestId.Row);
    expect(row).toHaveTextContent("#42");
    expect(row).toHaveTextContent("Fix flaky test");
    expect(row).toHaveTextContent("od alice");
    expect(row).toHaveTextContent("fix/flaky-test");
    expect(screen.queryByTestId(ProjectPullRequestsPanelTestId.Empty)).toBeNull();
  });

  it("merge button opens a confirm dialog naming the PR number; confirming fires the mutation", async () => {
    prsData = [pr({ number: 7 })];
    resolvedData = { people: [], integrations: [GITHUB_INTEGRATION] };
    mergeMutate.mockReset();
    const user = userEvent.setup();
    render(<ProjectPullRequestsPanel projectId="acme" />);

    await user.click(screen.getByTestId(ProjectPullRequestsPanelTestId.MergeButton));
    expect(screen.getByText("Sloučit PR #7?")).toBeInTheDocument();
    expect(mergeMutate).not.toHaveBeenCalled();

    // The dialog's confirm button shares the "Sloučit" label with the row button —
    // it's the second one in the document (dialog renders after the row).
    const confirmButtons = screen.getAllByText("Sloučit");
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    expect(mergeMutate).toHaveBeenCalledWith(
      { params: { id: "acme", number: 7 }, body: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("cancelling the confirm dialog never fires the mutation", async () => {
    prsData = [pr({ number: 3 })];
    resolvedData = { people: [], integrations: [GITHUB_INTEGRATION] };
    mergeMutate.mockReset();
    const user = userEvent.setup();
    render(<ProjectPullRequestsPanel projectId="acme" />);

    await user.click(screen.getByTestId(ProjectPullRequestsPanelTestId.MergeButton));
    await user.click(screen.getByText("Zrušit"));

    expect(mergeMutate).not.toHaveBeenCalled();
    expect(screen.queryByText("Sloučit PR #3?")).toBeNull();
  });
});

describe("ProjectPrCountBadge", () => {
  it("renders nothing when there are no open PRs", () => {
    prsData = [];
    render(<ProjectPrCountBadge projectId="acme" />);
    expect(screen.queryByTestId(ProjectPrCountBadgeTestId.Badge)).toBeNull();
  });

  it("shows the pluralized open-PR count", () => {
    prsData = [pr({ number: 1 }), pr({ number: 2 })];
    render(<ProjectPrCountBadge projectId="acme" />);
    expect(screen.getByTestId(ProjectPrCountBadgeTestId.Badge)).toHaveTextContent(
      "2 otevřené PR",
    );
  });
});
