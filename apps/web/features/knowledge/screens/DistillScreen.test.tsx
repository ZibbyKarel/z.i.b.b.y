import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { DistillScreen } from "./DistillScreen";

const mutate = vi.fn();
const createTask = vi.fn();
const push = vi.fn();
let teamId: string | null = null;
let ingestData: { projectId: string | null; log: { line: string }[] } = {
  projectId: "devrel-kb",
  log: [{ line: "- 2026-10-01 ingested A" }, { line: "- 2026-10-02 ingested B" }],
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
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
vi.mock("../queries/useTeamKbIngestQuery", () => ({
  useTeamKbIngestQuery: () => ({ isPending: false, isError: false, data: ingestData }),
}));
vi.mock("../../projects/queries", () => ({
  useProjectsQuery: () => ({ data: [{ id: "devrel-kb", name: "KB", path: "/kb/devrel" }] }),
}));
vi.mock("../../tasks/mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: createTask, isPending: false }),
}));

vi.mock("../../automations/queries/useAutomationsQuery", () => ({
  getAutomationsQueryKey: () => ["automations"],
  useAutomationsQuery: () => ({
    isPending: false,
    isError: false,
    data: [
      {
        id: "memory-distill",
        name: "Noční destilace paměti",
        trigger: { type: "cron", expr: "0 2 * * *" },
        target: { type: "memory-distill" },
        enabled: true,
        system: true,
      },
      {
        id: "gap-detect",
        name: "Detekce mezer",
        trigger: { type: "cron", expr: "30 2 * * *" },
        target: { type: "gap-detect" },
        enabled: true,
        system: true,
      },
      // Not a distillation target — must be filtered out.
      {
        id: "briefing",
        trigger: { type: "cron", expr: "0 7 * * *" },
        target: { type: "briefing" },
        enabled: true,
        system: true,
      },
    ],
  }),
}));

vi.mock("../../automations/mutations/useTriggerAutomationMutation", () => ({
  useTriggerAutomationMutation: () => ({ mutate, isPending: false }),
}));

vi.mock("../components/SelfKnowledgeSection", () => ({
  SelfKnowledgeSection: () => <div data-testid="self-knowledge-stub" />,
}));

describe("DistillScreen", () => {
  it("lists only the KNW-owned distillation automations", () => {
    render(<DistillScreen />);
    // The first automation is also the selected one, so its name shows in the
    // list and again as the detail panel's header.
    expect(screen.getAllByText("Noční destilace paměti").length).toBeGreaterThan(0);
    expect(screen.getByText("Detekce mezer")).toBeInTheDocument();
    expect(screen.queryByText("briefing")).not.toBeInTheDocument();
  });

  it("calls the existing trigger mutation on Run now", () => {
    render(<DistillScreen />);
    screen.getByTestId("distill-run-now").click();
    expect(mutate).toHaveBeenCalledWith(
      { params: { id: "memory-distill" }, body: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("hosts the self-model (self-knowledge) section", () => {
    render(<DistillScreen />);
    expect(screen.getByTestId("self-knowledge-stub")).toBeInTheDocument();
  });

  it("vault source shows the switcher but no sync button", () => {
    teamId = null;
    render(<DistillScreen />);
    expect(screen.getByRole("radiogroup", { name: /zdroj/i }) ?? true).toBeTruthy();
    expect(screen.queryByTestId("knowledge-sync")).toBeNull();
  });

  describe("team source", () => {
    it("shows the ingest log and the sync button, not the automations", () => {
      teamId = "devrel";
      render(<DistillScreen />);
      expect(screen.getByTestId("distill-ingest-log")).toHaveTextContent("ingested A");
      expect(screen.getByTestId("distill-ingest-log")).toHaveTextContent("ingested B");
      expect(screen.getByTestId("knowledge-sync")).toBeInTheDocument();
      expect(screen.queryByTestId("distill-run-now")).toBeNull();
      expect(screen.queryByTestId("self-knowledge-stub")).toBeNull();
    });

    it("starts team-kb-ingest on the KB project through the create-task mutation", () => {
      teamId = "devrel";
      render(<DistillScreen />);
      fireEvent.click(screen.getByTestId("distill-ingest-run"));
      expect(createTask).toHaveBeenCalledWith(
        {
          body: expect.objectContaining({
            paths: ["/kb/devrel"],
            target: expect.objectContaining({ kind: "workflow", id: "team-kb-ingest" }),
          }),
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it("without a registered project: explanatory empty state and no run button", () => {
      teamId = "devrel";
      ingestData = { projectId: null, log: [] };
      render(<DistillScreen />);
      expect(screen.getByTestId("distill-ingest-no-project")).toHaveTextContent(
        /team-kb-ingest\.md/,
      );
      expect(screen.queryByTestId("distill-ingest-run")).toBeNull();
      teamId = null;
    });
  });
});
