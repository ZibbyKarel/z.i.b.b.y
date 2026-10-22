import { AnchoredSheetTestId, NeedsYouCardTestId } from "@zibby/design-system";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import { RunSheet } from "./RunSheet";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("../../../runs/queries/useTaskRunQuery", () => ({
  useTaskRunQuery: () => ({
    data: {
      runId: "wf_1",
      kind: "workflow",
      owner: "book",
      status: "awaiting-approval",
      pct: null,
      title: "Book",
      prompt: "phase: render",
      project: "pub",
      startedAt: "2026-01-01T00:00:00.000Z",
      logBase: null,
      stageRuns: [{ phaseId: "audit" }],
    },
  }),
}));
vi.mock("../../../runs/queries/useRunArtifactQuery", () => ({
  useRunArtifactQuery: () => ({ data: { content: "# Audit report" } }),
}));
vi.mock("../../../runs/components/RunDetail", () => ({
  RunDetail: ({
    run,
    embedded,
    children,
  }: {
    run: { runId: string };
    embedded?: boolean;
    children?: ReactNode;
  }) => (
    <div data-testid="run-detail">
      {`${run.runId}${embedded ? " embedded" : ""}`}
      {children}
    </div>
  ),
}));
vi.mock("../../../workflows", () => ({
  useWorkflowsQuery: () => ({
    data: [{ id: "book", phases: [{ id: "audit", produces: "audit.md" }] }],
  }),
}));
vi.mock("../../../approvals", () => ({
  useApprovalsQuery: () => ({
    data: [
      {
        id: "g1",
        runId: "wf_1",
        kind: "workflow-gate",
        action: "stage-approval",
        skill: "Book",
        detail: "review audit.md",
        risk: "low",
        status: "pending",
        requestedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  }),
  useApproveMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const anchor = {
  side: "r",
  left: 0,
  width: 800,
  top: 0,
  height: 700,
  eL: 0,
  eT: 0,
  eH: 0,
} as const;

describe("RunSheet", () => {
  it("slots the phase output into the embedded run detail, with no second approval card", () => {
    renderWithProviders(<RunSheet anchor={anchor} id="wf_1" onClose={() => {}} />);
    expect(screen.getByTestId(AnchoredSheetTestId.Title)).toHaveTextContent("Book");
    expect(screen.queryByTestId(NeedsYouCardTestId.Root)).not.toBeInTheDocument();
    expect(screen.getByTestId("run-detail")).toHaveTextContent("wf_1 embedded");
    expect(screen.getByTestId("run-detail")).toHaveTextContent("Audit report");
  });
});
