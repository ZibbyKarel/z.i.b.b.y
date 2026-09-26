import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChainRouteStrip, ChainRouteStripTestId } from "./ChainRouteStrip";
import type { ChainRouteStripGate, ChainRouteStripStep } from "./ChainRouteStrip";

const STEPS: ChainRouteStripStep[] = [
  { code: "DEV", name: "Ship the feature", state: "done", pipeline: "Delivery" },
  { code: "QA", name: "Verify it", state: "working", pipeline: "Test" },
  { code: "REL", name: "Release it", state: "idle" },
];

const GATES: ChainRouteStripGate[] = [{ mode: "auto" }, { mode: "ask" }];

describe("ChainRouteStrip", () => {
  it("renders one chip per step in chip size", () => {
    render(<ChainRouteStrip size="chip" steps={STEPS} />);
    expect(screen.getAllByTestId(`${ChainRouteStripTestId.Step}-0`)[0]).toHaveTextContent("DEV");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByTestId(ChainRouteStripTestId.Connector)).toHaveLength(2);
  });

  it("renders step code and name in full size", () => {
    render(<ChainRouteStrip steps={STEPS} />);
    expect(screen.getAllByTestId(ChainRouteStripTestId.StepCode)[0]).toHaveTextContent("DEV");
    expect(screen.getAllByTestId(ChainRouteStripTestId.StepName)[0]).toHaveTextContent(
      "Ship the feature",
    );
  });

  it("renders gate markers between steps when gates are given", () => {
    render(<ChainRouteStrip gates={GATES} steps={STEPS} />);
    expect(screen.getByTestId(`${ChainRouteStripTestId.Gate}-0`)).toHaveTextContent("Auto");
    expect(screen.getByTestId(`${ChainRouteStripTestId.Gate}-1`)).toHaveTextContent("Ask");
  });

  it("renders no gate markers when gates is omitted", () => {
    render(<ChainRouteStrip steps={STEPS} />);
    expect(screen.queryByTestId(`${ChainRouteStripTestId.Gate}-0`)).not.toBeInTheDocument();
  });

  it("renders steps as static (non-interactive) when onStepClick is omitted", () => {
    render(<ChainRouteStrip steps={STEPS} />);
    expect(screen.getByTestId(`${ChainRouteStripTestId.Step}-0`).tagName).toBe("DIV");
  });

  it("renders steps as buttons and fires onStepClick when provided", async () => {
    const onStepClick = vi.fn();
    render(<ChainRouteStrip onStepClick={onStepClick} steps={STEPS} />);
    const step = screen.getByTestId(`${ChainRouteStripTestId.Step}-1`);
    expect(step.tagName).toBe("BUTTON");
    await userEvent.click(step);
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it("fires the gate's onClick when a gate marker is clicked", async () => {
    const onGateClick = vi.fn();
    render(
      <ChainRouteStrip
        gates={[{ mode: "auto", onClick: onGateClick }]}
        steps={STEPS.slice(0, 2)}
      />,
    );
    await userEvent.click(screen.getByTestId(`${ChainRouteStripTestId.Gate}-0`));
    expect(onGateClick).toHaveBeenCalledOnce();
  });

  it("renders compact size with step code/name and vertical gates", () => {
    render(<ChainRouteStrip gates={GATES} size="compact" steps={STEPS} />);
    expect(screen.getByTestId(`${ChainRouteStripTestId.Gate}-0`)).toBeInTheDocument();
    expect(screen.getAllByTestId(ChainRouteStripTestId.StepName)).toHaveLength(3);
  });
});
