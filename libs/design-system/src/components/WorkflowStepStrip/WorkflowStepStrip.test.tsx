import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowStepStrip, WorkflowStepStripTestId } from "./WorkflowStepStrip";
import type { WorkflowStepStripPhase } from "./WorkflowStepStrip";

const PHASES: WorkflowStepStripPhase[] = [
  { label: "Architekt", state: "done" },
  { label: "Kodér", state: "working" },
  { label: "Code-review", state: "idle", loopBack: true },
  { label: "Tester", state: "idle" },
];

describe("WorkflowStepStrip", () => {
  it("renders one chip per phase", () => {
    render(<WorkflowStepStrip phases={PHASES} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("renders a forward connector by default", () => {
    render(<WorkflowStepStrip phases={PHASES} />);
    const connectors = screen.getAllByTestId(WorkflowStepStripTestId.Connector);
    expect(connectors).toHaveLength(3);
    expect(connectors[0]).toHaveTextContent("→");
  });

  it("renders a loop-back connector after a phase flagged loopBack", () => {
    render(<WorkflowStepStrip phases={PHASES} />);
    const connectors = screen.getAllByTestId(WorkflowStepStripTestId.Connector);
    expect(connectors[2]).toHaveTextContent("⇄");
  });

  it("highlights the current phase", () => {
    render(<WorkflowStepStrip current={1} phases={PHASES} />);
    expect(screen.getByTestId(`${WorkflowStepStripTestId.Step}-1`)).toHaveClass("border-ink");
    expect(screen.getByTestId(`${WorkflowStepStripTestId.Step}-0`)).not.toHaveClass("border-ink");
  });
});
