import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PipelineStepStrip, PipelineStepStripTestId } from "./PipelineStepStrip";
import type { PipelineStepStripPhase } from "./PipelineStepStrip";

const PHASES: PipelineStepStripPhase[] = [
  { label: "Architekt", state: "done" },
  { label: "Kodér", state: "working" },
  { label: "Code-review", state: "idle", loopBack: true },
  { label: "Tester", state: "idle" },
];

describe("PipelineStepStrip", () => {
  it("renders one chip per phase", () => {
    render(<PipelineStepStrip phases={PHASES} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("renders a forward connector by default", () => {
    render(<PipelineStepStrip phases={PHASES} />);
    const connectors = screen.getAllByTestId(PipelineStepStripTestId.Connector);
    expect(connectors).toHaveLength(3);
    expect(connectors[0]).toHaveTextContent("→");
  });

  it("renders a loop-back connector after a phase flagged loopBack", () => {
    render(<PipelineStepStrip phases={PHASES} />);
    const connectors = screen.getAllByTestId(PipelineStepStripTestId.Connector);
    expect(connectors[2]).toHaveTextContent("⇄");
  });

  it("highlights the current phase", () => {
    render(<PipelineStepStrip current={1} phases={PHASES} />);
    expect(screen.getByTestId(`${PipelineStepStripTestId.Step}-1`)).toHaveClass("border-ink");
    expect(screen.getByTestId(`${PipelineStepStripTestId.Step}-0`)).not.toHaveClass("border-ink");
  });
});
